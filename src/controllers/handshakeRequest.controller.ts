import { type Request, type Response } from "express";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getSystemConfigNumber } from "@/lib/handshake";

interface SendHandshakeRequestBody {
  toUserId: string;
  requestedAppId: number;
  offeredAppId?: number | null;
  message?: string | null;
}

/**
 * Spec §3: send a handshake request to another developer.
 * Spec §8: auto-mutual-match if a reciprocal request already exists.
 * Spec §3.1: admin-configurable per-user request limit.
 * Spec §4: requests expire after `handshake_request_expiry_days`.
 *
 * Race-condition fixes:
 *   - H-B1: mutual-match lookup + insert in a single transaction with row lock
 *   - H-B2: per-user request count check inside the same transaction
 */
export const sendHandshakeRequest = async (req: Request, res: Response) => {
  try {
    const fromUserId = req?.userId;
    if (!fromUserId) {
      return sendError(res, 401, "Unauthorized");
    }

    const body: SendHandshakeRequestBody = req.body?.payload ?? req.body;
    const { toUserId, requestedAppId, offeredAppId, message } = body ?? {};
    if (!toUserId || !requestedAppId) {
      return sendError(
        res,
        400,
        "toUserId and requestedAppId are required",
      );
    }
    if (fromUserId === toUserId) {
      return sendError(res, 400, "Cannot send a handshake request to yourself");
    }

    // P1.5: server-side penalty gate (spec §30) ,  penalized users may not
    // send new handshake requests until they serve their tasks.
    const { getActivePenaltyCount } = await import("@/lib/handshake");
    if ((await getActivePenaltyCount(fromUserId)) > 0) {
      return sendError(
        res,
        423,
        "You have an active penalty that must be served before sending handshake requests",
        undefined,
        undefined,
        { blocked: true, reason: "Active penalty ,  see /handshake-testing/penalty" },
      );
    }

    const expiryDays = await getSystemConfigNumber(
      "handshake_request_expiry_days",
      7,
    );
    const requestLimit = await getSystemConfigNumber(
      "handshake_request_limit_per_user",
      12,
    );

    // S8-G3: duplicate-request guard , one active request per
    // (sender, target, campaign). Prevents spamming the same developer with
    // repeated requests (with different offered apps) while one is pending.
    // P2.3 follow-up: only PENDING blocks ,  legacy MUTUAL_MATCHED rows whose
    // handshake later ended must not 409 re-requests forever.
    const duplicate = await prismaClient.handshakeRequest.findFirst({
      where: {
        fromUserId,
        toUserId,
        requestedAppId,
        status: "PENDING",
      },
      select: { id: true, status: true },
    });
    if (duplicate) {
      return sendError(
        res,
        409,
        "You already have an active handshake request with this developer for this campaign",
      );
    }

    // S13: block the exact reverse of an already-pending request. If the
    // target developer already sent me a request asking to test my offered
    // app, the right action is to accept/reject that incoming request from
    // the inbox ,  not to send a reverse request for the same pair of apps.
    // The in-transaction reciprocal lookup below still handles the true
    // race where both sides hit this guard at the same instant.
    if (offeredAppId) {
      const exactReverse = await prismaClient.handshakeRequest.findFirst({
        where: {
          fromUserId: toUserId,
          toUserId: fromUserId,
          requestedAppId: offeredAppId,
          offeredAppId: requestedAppId,
          status: "PENDING",
        },
        select: { id: true, status: true },
      });
      if (exactReverse) {
        return sendError(
          res,
          409,
          "This developer already sent you a handshake request for these apps. Please accept or reject it from your incoming requests.",
        );
      }
    }

    const targetApp = await prismaClient.dashboardAndHub.findUnique({
      where: { id: requestedAppId },
      select: {
        id: true,
        appOwnerId: true,
        status: true,
        appType: true,
      },
    });
    if (!targetApp) {
      return sendError(res, 404, "Target app not found");
    }
    if (targetApp.appOwnerId !== toUserId) {
      return sendError(
        res,
        400,
        "Requested app is not owned by the target user",
      );
    }
    if (targetApp.appType !== "HANDSHAKE") {
      return sendError(
        res,
        400,
        "Only handshake apps can receive handshake requests",
      );
    }
    if (
      targetApp.status !== "AVAILABLE" &&
      targetApp.status !== "FINDING_TESTERS"
    ) {
      return sendError(res, 400, "Target app is not currently accepting requests");
    }

    // Spec §3 / decision: the requester must offer one of their own published
    // apps. A request without an offer can never mutually match.
    if (!offeredAppId) {
      return sendError(
        res,
        400,
        "offeredAppId is required ,  pick one of your published Handshake apps to offer",
      );
    }
    {
      const offeredApp = await prismaClient.dashboardAndHub.findUnique({
        where: { id: offeredAppId },
        select: {
          id: true,
          appOwnerId: true,
          status: true,
          appType: true,
        },
      });
      if (!offeredApp) {
        return sendError(res, 404, "Offered app not found");
      }
      if (offeredApp.appOwnerId !== fromUserId) {
        return sendError(
          res,
          403,
          "Offered app must be owned by the requester",
        );
      }
      if (offeredApp.appType !== "HANDSHAKE") {
        return sendError(
          res,
          400,
          "Offered app must be a handshake app",
        );
      }
      if (
        offeredApp.status !== "AVAILABLE" &&
        offeredApp.status !== "FINDING_TESTERS"
      ) {
        return sendError(
          res,
          400,
          "Offered app is not currently available for testing",
        );
      }
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiryDays);

    // H-B1 + H-B2: Wrap the count, reciprocal lookup, and insert in a single
    // transaction with SERIALIZABLE isolation to prevent mutual-match races
    // AND TOCTOU limit overruns. PostgreSQL SERIALIZABLE may throw on conflict;
    // we retry once on serialization failure.
    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
      attempts += 1;
      try {
        const result = await prismaClient.$transaction(
          async (tx) => {
            // P2.3: only PENDING rows consume the outgoing-request limit.
            // MUTUAL_MATCHED rows used to be counted forever, permanently
            // locking out users after 12 lifetime mutual matches.
            const activeCount = await tx.handshakeRequest.count({
              where: {
                fromUserId,
                status: "PENDING",
              },
            });
            if (activeCount >= requestLimit) {
              throw new Error("__REQUEST_LIMIT_REACHED__");
            }

            const reciprocal = await tx.handshakeRequest.findFirst({
              where: {
                fromUserId: toUserId,
                toUserId: fromUserId,
                requestedAppId: offeredAppId,
                offeredAppId: requestedAppId,
                status: "PENDING",
              },
            });

            if (reciprocal) {
              const now = new Date();
              // P2.3: matched rows are terminalized as ACCEPTED instead of
              // lingering as MUTUAL_MATCHED forever (frontend renders both
              // identically).
              await tx.handshakeRequest.update({
                where: { id: reciprocal.id },
                data: { status: "ACCEPTED", respondedAt: now },
              });
              const mine = await tx.handshakeRequest.create({
                data: {
                  fromUserId,
                  toUserId,
                  requestedAppId,
                  offeredAppId,
                  message: message ?? null,
                  status: "ACCEPTED",
                  expiresAt,
                  respondedAt: now,
                },
              });

              // P2.1: shared creation path ,  slot caps for BOTH users,
              // relations, ACTIVE link, counter increments, WAITING stamp,
              // S8-G4 cancellation of other pending requests on fill.
              const { createMutualHandshake } = await import("@/lib/handshake");
              await createMutualHandshake(tx, {
                requesterId: fromUserId,
                ownerId: toUserId,
                requestedAppId,
                offeredAppId,
                excludeRequestIds: [reciprocal.id, mine.id],
              });

              return {
                mutualMatch: true,
                mine,
                reciprocal,
              };
            }

            const created = await tx.handshakeRequest.create({
              data: {
                fromUserId,
                toUserId,
                requestedAppId,
                offeredAppId,
                message: message ?? null,
                status: "PENDING",
                expiresAt,
              },
            });
            return { mutualMatch: false, mine: created };
          },
          {
            // SERIALIZABLE isolation prevents mutual-match race (H-B1) and
            // limit-count TOCTOU race (H-B2). PostgreSQL may throw on
            // serialization failure; we retry up to 3x.
            isolationLevel: "Serializable" as any,
          },
        );

        if (result.mutualMatch) {
          return sendSuccess(
            res,
            {
              mutualMatch: true,
              request: result.mine,
              reciprocalRequestId: result.reciprocal!.id,
              linkCreated: true,
            },
            "Mutual match ,  handshake established",
          );
        }
        return sendSuccess(
          res,
          { mutualMatch: false, request: result.mine },
          "Handshake request sent",
        );
      } catch (err: any) {
        if (err?.message === "__REQUEST_LIMIT_REACHED__") {
          return sendError(
            res,
            429,
            `You have reached the maximum of ${requestLimit} active handshake requests`,
          );
        }
        if (err?.message === "__SLOT_FULL__") {
          return sendError(
            res,
            409,
            "One of these campaigns just filled up. Please try again with a different app.",
          );
        }
        if (err?.message === "__ALREADY_PARTICIPATING__") {
          return sendError(
            res,
            409,
            "You or the other developer already have an active participation in one of these campaigns.",
          );
        }
        if (err?.message === "__SLOTS_EXHAUSTED__") {
          return sendError(
            res,
            409,
            "You or the other developer have reached your handshake slot limit. Complete an existing handshake or level up first.",
            undefined,
            undefined,
            { slotsExhausted: true },
          );
        }
        if (err?.message === "__INVALID_CAMPAIGN__") {
          return sendError(
            res,
            400,
            "One of the campaigns is no longer available for this handshake",
          );
        }
        // S5c-2: Prisma surfaces Postgres serialization failures as
        // P2034 (write conflict / deadlock). 40001/40P01 kept as raw-code
        // fallbacks in case an error escapes Prisma's wrapper.
        const isSerialization =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2034";
        const code = err?.code;
        if (
          (isSerialization || code === "40001" || code === "40P01") &&
          attempts < maxAttempts
        ) {
          // retry with a tiny backoff
          await new Promise((r) => setTimeout(r, 20 * attempts));
          continue;
        }
        throw err;
      }
    }
    return sendError(
      res,
      409,
      "Could not send handshake request due to concurrent activity, please retry",
    );
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "handshakeRequest",
      action: "sendHandshakeRequest",
      targetId: String(req?.body?.payload?.toUserId || ""),
      result: "fail",
      reason: error instanceof Error ? error.message : "Unknown error",
      ip: req?.userIpAddress || "",
      ua: req?.userAgent || "",
    };
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
      auditLogPayloadFail,
    );
  }
};

/**
 * Spec §3: accept an incoming handshake request.
 * P2.2: accepting now performs the FULL handshake lifecycle (relations +
 * ACTIVE link + counter increments + 24h WAITING stamp via the shared
 * createMutualHandshake helper) instead of merely flipping the row to
 * ACCEPTED and stranding the pair.
 *
 * H-B3: status check + update in a single atomic update inside the same
 * transaction as creation, so the 5-min expiry cron cannot clobber an
 * in-flight accept and a failed creation rolls the ACCEPTED flip back.
 */
export const acceptHandshakeRequest = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    const id = parseInt(String(req?.params?.id || ""), 10);
    if (!userId) return sendError(res, 401, "Unauthorized");
    if (!id || isNaN(id)) return sendError(res, 400, "Request id is required");

    const inspectedAt = new Date();
    // Pre-transaction inspection for precise error messages.
    const target = await prismaClient.handshakeRequest.findUnique({
      where: { id },
    });
    if (!target) return sendError(res, 404, "Request not found");
    if (target.toUserId !== userId)
      return sendError(res, 403, "Only the addressee can accept");
    if (target.status !== "PENDING")
      return sendError(
        res,
        409,
        `Request is no longer pending (status: ${target.status})`,
      );
    if (target.expiresAt <= inspectedAt) {
      await prismaClient.handshakeRequest.updateMany({
        where: { id, status: "PENDING" },
        data: { status: "EXPIRED", respondedAt: inspectedAt },
      });
      return sendError(res, 409, "Request has expired");
    }
    if (!target.offeredAppId) {
      return sendError(
        res,
        400,
        "This request is missing the offered app and cannot be accepted",
      );
    }

    // P1.5: server-side penalty gate ,  accepting creates a live handshake,
    // which penalized users must not enter until they serve their tasks.
    const { getActivePenaltyCount } = await import("@/lib/handshake");
    if ((await getActivePenaltyCount(userId)) > 0) {
      return sendError(
        res,
        423,
        "You have an active penalty that must be served before accepting handshake requests",
        undefined,
        undefined,
        {
          blocked: true,
          reason: "Active penalty ,  see /handshake-testing/penalty",
        },
      );
    }

    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
      attempts += 1;
      try {
        const created = await prismaClient.$transaction(
          async (tx) => {
            // H-B3: atomic claim with expiry guard ,  races with the expiry
            // cron or a competing accept/cancel abort here before anything
            // else is written.
            const claim = await tx.handshakeRequest.updateMany({
              where: {
                id,
                toUserId: userId,
                status: "PENDING",
                expiresAt: { gt: new Date() },
              },
              data: { status: "ACCEPTED", respondedAt: new Date() },
            });
            if (claim.count === 0) throw new Error("__REQUEST_GONE__");

            const { createMutualHandshake } = await import("@/lib/handshake");
            const ids = await createMutualHandshake(tx, {
              requesterId: target.fromUserId,
              ownerId: userId,
              requestedAppId: target.requestedAppId,
              offeredAppId: target.offeredAppId!,
              excludeRequestIds: [id],
            });

            // Notify the requester that their offer was accepted.
            await tx.notification.create({
              data: {
                title: "Handshake Accepted!",
                description:
                  "Your handshake request was accepted and the testing agreement is now active.",
                type: "NEW_JOIN_ACCEPT",
                userId: target.fromUserId,
                isActive: true,
              },
            });

            return ids;
          },
          {
            isolationLevel: "Serializable" as any,
          },
        );

        return sendSuccess(
          res,
          { id, ...created, linkCreated: true },
          "Handshake established",
        );
      } catch (err: any) {
        if (err?.message === "__REQUEST_GONE__") {
          const fresh = await prismaClient.handshakeRequest.findUnique({
            where: { id },
          });
          if (!fresh) return sendError(res, 404, "Request not found");
          if (fresh.status === "EXPIRED")
            return sendError(res, 409, "Request has expired");
          return sendError(
            res,
            409,
            `Request is no longer pending (status: ${fresh.status})`,
          );
        }
        if (err?.message === "__SLOT_FULL__") {
          return sendError(
            res,
            409,
            "One of these campaigns just filled up. The request stays pending for the owner to retry later.",
          );
        }
        if (err?.message === "__ALREADY_PARTICIPATING__") {
          return sendError(
            res,
            409,
            "You or the requester already have an active participation in one of these campaigns.",
          );
        }
        if (err?.message === "__SLOTS_EXHAUSTED__") {
          return sendError(
            res,
            409,
            "You or the requester have reached your handshake slot limit.",
            undefined,
            undefined,
            { slotsExhausted: true },
          );
        }
        if (err?.message === "__INVALID_CAMPAIGN__") {
          return sendError(
            res,
            400,
            "One of the campaigns is no longer available for this handshake",
          );
        }
        // S5c-2: Prisma surfaces Postgres serialization failures as P2034
        // (40001/40P01 raw-code fallbacks kept).
        const isSerialization =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2034";
        const code = err?.code;
        if (
          (isSerialization || code === "40001" || code === "40P01") &&
          attempts < maxAttempts
        ) {
          await new Promise((r) => setTimeout(r, 20 * attempts));
          continue;
        }
        return sendError(
          res,
          400,
          err instanceof Error ? err.message : "Unknown error",
        );
      }
    }
    return sendError(
      res,
      409,
      "Could not accept the request due to concurrent activity, please retry",
    );
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
};

/**
 * Spec §3: reject an incoming handshake request (reason required).
 * H-B3: atomic update with status guard.
 */
export const rejectHandshakeRequest = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    const id = parseInt(String(req?.params?.id || ""), 10);
    if (!userId) return sendError(res, 401, "Unauthorized");
    if (!id || isNaN(id)) return sendError(res, 400, "Request id is required");

    const reason = String(req?.body?.payload?.reason || "").trim();
    if (!reason) {
      return sendError(res, 400, "Rejection reason is required");
    }

    const result = await prismaClient.handshakeRequest.updateMany({
      where: {
        id,
        toUserId: userId,
        status: "PENDING",
      },
      data: {
        status: "REJECTED",
        rejectionReason: reason,
        respondedAt: new Date(),
      },
    });

    if (result.count === 0) {
      const target = await prismaClient.handshakeRequest.findUnique({ where: { id } });
      if (!target) return sendError(res, 404, "Request not found");
      if (target.toUserId !== userId)
        return sendError(res, 403, "Only the addressee can reject");
      return sendError(
        res,
        409,
        `Request is no longer pending (status: ${target.status})`,
      );
    }

    return sendSuccess(res, { id }, "Handshake request rejected");
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
};

/**
 * Spec §3: sender cancels their own outstanding request.
 * H-B3: atomic update with status guard.
 */
export const cancelHandshakeRequest = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    const id = parseInt(String(req?.params?.id || ""), 10);
    if (!userId) return sendError(res, 401, "Unauthorized");
    if (!id || isNaN(id)) return sendError(res, 400, "Request id is required");

    const result = await prismaClient.handshakeRequest.updateMany({
      where: {
        id,
        fromUserId: userId,
        status: "PENDING",
      },
      data: { status: "CANCELLED", respondedAt: new Date() },
    });

    if (result.count === 0) {
      const target = await prismaClient.handshakeRequest.findUnique({ where: { id } });
      if (!target) return sendError(res, 404, "Request not found");
      if (target.fromUserId !== userId)
        return sendError(res, 403, "Only the sender can cancel");
      return sendError(
        res,
        409,
        `Request is no longer pending (status: ${target.status})`,
      );
    }

    return sendSuccess(res, { id }, "Handshake request cancelled");
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
};

/**
 * Spec §3.2: list incoming or outgoing handshake requests with pagination.
 * Spec §4: expired requests are filtered out from PENDING results.
 */
export const listHandshakeRequests = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    if (!userId) return sendError(res, 401, "Unauthorized");

    const direction = String(req?.query?.direction || "incoming");
    const status = req?.query?.status
      ? String(req.query.status)
      : undefined;
    const page = Math.max(1, parseInt(String(req?.query?.page || "1"), 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req?.query?.limit || "20"), 10)),
    );

    const where: any = {};
    if (direction === "incoming") {
      where.toUserId = userId;
    } else if (direction === "outgoing") {
      where.fromUserId = userId;
    } else {
      return sendError(
        res,
        400,
        "direction must be 'incoming' or 'outgoing'",
      );
    }
    if (status) where.status = status;

    if (!status || status === "PENDING") {
      if (!where.AND) where.AND = [];
      where.AND.push({
        OR: [
          { status: { not: "PENDING" } },
          { expiresAt: { gt: new Date() } },
        ],
      });
    }

    const [items, total] = await Promise.all([
      prismaClient.handshakeRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          fromUser: { select: { id: true, name: true, image: true } },
          toUser: { select: { id: true, name: true, image: true } },
          requestedApp: {
            select: {
              id: true,
              appOwnerId: true,
              status: true,
              androidApp: {
                select: {
                  appName: true,
                  appLogoUrl: true,
                  packageName: true,
                },
              },
            },
          },
          offeredApp: {
            select: {
              id: true,
              appOwnerId: true,
              status: true,
              androidApp: {
                select: {
                  appName: true,
                  appLogoUrl: true,
                  packageName: true,
                },
              },
            },
          },
        },
      }),
      prismaClient.handshakeRequest.count({ where }),
    ]);

    return sendSuccess(
      res,
      {
        items,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      "ok",
    );
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
};
