import { type Request, type Response } from "express";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient, Prisma } from "@/lib/prisma";

/**
 * Spec §40, §41: admin monitoring overview with key counters.
 */
export const getMonitoringOverview = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      waiting,
      waitingOver24h,
      activeHandshakes,
      activePenalties,
      proTesterOpen,
      eliteBadgesAwarded,
      pendingRequests,
      pendingStartRequests,
      campaignsByStatus,
    ] = await Promise.all([
      prismaClient.dashboardAndHub.count({
        where: { status: "WAITING_FOR_PARTNERS" },
      }),
      prismaClient.dashboardAndHub.count({
        where: {
          status: "WAITING_FOR_PARTNERS",
          OR: [
            { escalatedToAdminAt: { not: null } },
            { waitingPeriodStartedAt: { lt: twentyFourHoursAgo } },
          ],
        },
      }),
      prismaClient.handshakeLink.count({ where: { status: "ACTIVE" } }),
      prismaClient.penaltyTask.count({
        where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
      }),
      prismaClient.professionalTesterAssignment.count({
        where: { status: "OPEN" },
      }),
      prismaClient.user.count({ where: { eliteBadge: true } }),
      prismaClient.handshakeRequest.count({
        where: { status: "PENDING", expiresAt: { gt: now } },
      }),
      prismaClient.dashboardAndHub.count({
        where: { appType: "HANDSHAKE", status: "START_REQUESTED" },
      }),
      prismaClient.dashboardAndHub.groupBy({
        by: ["status"],
        _count: { _all: true },
        where: { appType: "HANDSHAKE" },
      }),
    ]);

    return sendSuccess(
      res,
      {
        waiting,
        waitingOver24h,
        activeHandshakes,
        activePenalties,
        proTesterOpen,
        eliteBadgesAwarded,
        pendingRequests,
        pendingStartRequests,
        campaignsByStatus,
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

/**
 * Spec §41: list campaigns waiting for partners > 24h (escalation candidates).
 */
export const getWaitingCampaigns = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const items = await prismaClient.dashboardAndHub.findMany({
      where: {
        status: "WAITING_FOR_PARTNERS",
        OR: [
          { escalatedToAdminAt: { not: null } },
          { waitingPeriodStartedAt: { lt: twentyFourHoursAgo } },
        ],
      },
      orderBy: { waitingPeriodStartedAt: "asc" },
      include: {
        appOwner: { select: { id: true, name: true, image: true } },
        androidApp: { select: { appName: true, appLogoUrl: true } },
        testerRelations: {
          where: { isActive: true },
          select: {
            id: true,
            status: true,
            tester: { select: { id: true, name: true } },
            // Partner readiness for the admin waiting view: traverse the
            // ACTIVE link to the partner's own campaign so admins can see
            // WHO is unready and force-handshake THEIR campaign (it has
            // free capacity — the waiting campaign itself is full).
            handshakeLinkAsA: {
              select: {
                status: true,
                relationB: {
                  select: {
                    dashboardAndHub: {
                      select: { id: true, status: true },
                    },
                  },
                },
              },
            },
            handshakeLinkAsB: {
              select: {
                status: true,
                relationA: {
                  select: {
                    dashboardAndHub: {
                      select: { id: true, status: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Collapse each tester's ACTIVE link into partner readiness + the
    // partner's campaign id, so the admin panel can link directly to the
    // unready partner's campaign for force-handshake.
    const mapped = items.map((item: any) => ({
      ...item,
      testerRelations: (item.testerRelations || []).map((r: any) => {
        const link =
          [r.handshakeLinkAsA, r.handshakeLinkAsB].find(
            (l: any) => l?.status === "ACTIVE",
          ) ?? null;
        const partnerCampaign =
          link &&
          (r.handshakeLinkAsA?.status === "ACTIVE"
            ? r.handshakeLinkAsA?.relationB?.dashboardAndHub
            : r.handshakeLinkAsB?.relationA?.dashboardAndHub);
        const partnerReadiness: "READY" | "FINDING" | null = !link
          ? null
          : partnerCampaign &&
              [
                "WAITING_FOR_PARTNERS",
                "TESTING_ACTIVE",
                "COMPLETED",
              ].includes(partnerCampaign.status)
            ? "READY"
            : "FINDING";
        const { handshakeLinkAsA, handshakeLinkAsB, ...rest } = r;
        return {
          ...rest,
          partnerReadiness,
          partnerCampaignId: partnerCampaign?.id ?? null,
        };
      }),
    }));

    return sendSuccess(res, { items: mapped as any }, "ok");
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
};

/**
 * Recent missed days across all active campaigns.
 */
export const getPenalizedUsers = async (req: Request, res: Response) => {
  try {
    const users = await prismaClient.user.findMany({
      where: {
        penaltyTasks: {
          some: { status: { in: ["PENDING", "IN_PROGRESS"] } },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        handshakeLevel: true,
        penaltyTasks: {
          where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
          select: {
            id: true,
            reason: true,
            assignedAt: true,
            deadline: true,
            status: true,
            taskAppId: true,
            penaltyStartAt: true,
            sourceCampaign: {
              select: {
                id: true,
                androidApp: { select: { appName: true } },
              },
            },
            taskApp: {
              select: {
                id: true,
                androidApp: { select: { appName: true } },
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return sendSuccess(res, { items: users }, "ok");
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
};

/**
 * Recent missed days across all active campaigns.
 */
export const getRecentMissedDays = async (req: Request, res: Response) => {
  try {
    const limit = Math.min(
      200,
      Math.max(1, parseInt(String(req?.query?.limit || "100"), 10)),
    );
    const items = await prismaClient.missedDay.findMany({
      orderBy: { recordedAt: "desc" },
      take: limit,
      include: {
        testerRelation: {
          select: {
            id: true,
            testerId: true,
            tester: { select: { id: true, name: true, email: true } },
            dashboardAndHub: {
              select: {
                id: true,
                androidApp: { select: { appName: true, appLogoUrl: true } },
              },
            },
          },
        },
      },
    });

    return sendSuccess(res, { items }, "ok");
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
};

/**
 * Admin: replace (remove) a failing tester. Per locked decision, this does
 * NOT auto-assign a replacement; admin must follow up with
 * `assignProfessionalTester` or `forceHandshake`.
 */
export const adminReplaceTester = async (req: Request, res: Response) => {
  try {
    const adminId = req?.userId;
    if (!adminId) return sendError(res, 401, "Unauthorized");

    const testerRelationId = parseInt(
      String(req?.body?.payload?.testerRelationId || ""),
      10,
    );
    const reason = String(req?.body?.payload?.reason || "").trim();
    if (!testerRelationId || isNaN(testerRelationId)) {
      return sendError(res, 400, "testerRelationId is required");
    }

    const relation = await prismaClient.testerRelation.findUnique({
      where: { id: testerRelationId },
      include: { dashboardAndHub: true },
    });
    if (!relation) return sendError(res, 404, "Tester relation not found");

    // P2.7: full cleanup via shared helper — cancels ACTIVE links,
    // decrements counters, frees the innocent partner (the old copy only
    // flipped the status and left slots occupied + sweeps punishing).
    const { adminTerminateRelation } = await import("@/lib/handshake");
    const outcome = await adminTerminateRelation({
      relationId: testerRelationId,
      adminId,
      terminalStatus: "REPLACED",
      reason: reason || "Admin replaced",
    });

    return sendSuccess(
      res,
      {
        testerRelationId,
        freedCampaignIds: outcome.freedCampaignIds,
        partnersReleased: outcome.partnerUserIds.length,
        nextStep:
          "Admin must manually fill the slot via assignProfessionalTester or forceHandshake.",
      },
      "Tester replaced — slot is now open",
    );
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "handshakeMonitoring",
      action: "adminReplaceTester",
      targetId: String(req?.body?.payload?.testerRelationId || ""),
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

interface ForceHandshakeBody {
  userAId: string;
  userBId: string;
  appAId: number;
  appBId: number;
}

/**
 * Admin: force two developers into a handshake, bypassing normal matching.
 */
export const adminForceHandshake = async (req: Request, res: Response) => {
  try {
    const adminId = req?.userId;
    if (!adminId) return sendError(res, 401, "Unauthorized");

    const body: ForceHandshakeBody = req.body?.payload ?? req.body;
    const userAId = String(body?.userAId || "");
    const userBId = String(body?.userBId || "");
    const appAId = parseInt(String(body?.appAId || ""), 10);
    const appBId = parseInt(String(body?.appBId || ""), 10);
    if (!userAId || !userBId || !appAId || !appBId) {
      return sendError(
        res,
        400,
        "userAId, userBId, appAId, appBId are required",
      );
    }

    // S7-7: ownership + distinctness + type validation. Convention: userA
    // owns appA, userB owns appB (B tests appA, A tests appB). Crossed IDs
    // would silently reintroduce the self-testing bug.
    if (userAId === userBId) {
      return sendError(res, 400, "userAId and userBId must be different users");
    }
    if (appAId === appBId) {
      return sendError(res, 400, "appAId and appBId must be different campaigns");
    }

    // H-B8 (S4c-5): Relations must be IN_PROGRESS (not PENDING) and both
    // campaigns must transition to TESTING_ACTIVE so daily verification can
    // proceed. The 24h wait is bypassed because admin force-initiated.
    // S5b-5: dedup + capacity validation before creating anything.
    const existingPairs = await prismaClient.testerRelation.findMany({
      where: {
        OR: [
          { testerId: userBId, dashboardAndHubId: appAId },
          { testerId: userAId, dashboardAndHubId: appBId },
        ],
      },
      select: { testerId: true, dashboardAndHubId: true, status: true },
    });
    const activeConflict = existingPairs.some(
      (r) => !["REMOVED", "REPLACED", "DROPPED"].includes(r.status),
    );
    if (activeConflict) {
      return sendError(
        res,
        409,
        "One of these users already has an active relation with the target campaign",
      );
    }

    const campaigns = await prismaClient.dashboardAndHub.findMany({
      where: { id: { in: [appAId, appBId] } },
      select: {
        id: true,
        status: true,
        currentTester: true,
        totalTester: true,
        appOwnerId: true,
        appType: true,
      },
    });
    if (campaigns.length !== 2) {
      return sendError(res, 404, "One or both campaigns were not found");
    }
    const campaignA = campaigns.find((c) => c.id === appAId)!;
    const campaignB = campaigns.find((c) => c.id === appBId)!;
    if (campaignA.appOwnerId !== userAId) {
      return sendError(
        res,
        400,
        `Campaign ${appAId} is not owned by ${userAId} — check that userA/appA and userB/appB are correctly paired`,
      );
    }
    if (campaignB.appOwnerId !== userBId) {
      return sendError(
        res,
        400,
        `Campaign ${appBId} is not owned by ${userBId} — check that userA/appA and userB/appB are correctly paired`,
      );
    }
    for (const c of campaigns) {
      if (c.appType !== "HANDSHAKE") {
        return sendError(
          res,
          400,
          `Force-handshake only applies to HANDSHAKE campaigns (campaign ${c.id} is ${c.appType})`,
        );
      }
      if (
        c.status === "COMPLETED" ||
        c.currentTester >= c.totalTester
      ) {
        return sendError(
          res,
          409,
          `Campaign ${c.id} has no free capacity (currentTester=${c.currentTester}, totalTester=${c.totalTester})`,
        );
      }
    }

    const now = new Date();
    const result = await prismaClient.$transaction(async (tx) => {
      // P2.8: route both creates through the shared upsert helper — a
      // REPLACED/REMOVED/DROPPED leftover row (e.g. from a prior
      // replace-tester) previously hit the unique constraint as a raw P2002,
      // breaking the exact replace→force workflow this tool advertises.
      const { upsertTesterRelation } = await import("@/lib/handshake");
      const relationA = await upsertTesterRelation(tx, {
        testerId: userBId,
        hubId: appAId,
        reactivateStatus: "IN_PROGRESS",
        assignmentSource: "ADMIN_ASSIGNED",
        offeredAppId: appBId,
      });
      const relationB = await upsertTesterRelation(tx, {
        testerId: userAId,
        hubId: appBId,
        reactivateStatus: "IN_PROGRESS",
        assignmentSource: "ADMIN_ASSIGNED",
        offeredAppId: appAId,
      });
      const link = await tx.handshakeLink.create({
        data: {
          relationAId: relationA.id,
          relationBId: relationB.id,
          status: "ACTIVE",
        },
      });

      // Transition both campaigns to TESTING_ACTIVE.
      // Compute testingEndDate from each app's totalDay (default 16).
      const apps = await tx.dashboardAndHub.findMany({
        where: { id: { in: [appAId, appBId] } },
        select: { id: true, totalDay: true, status: true },
      });
      for (const app of apps) {
        if (app.status === "REMOVED" || app.status === "COMPLETED") continue;

        // S6-4: increment occupancy so capacity checks / dashboards stay
        // truthful (previously the forced tester was invisible to counters,
        // letting normal accepts overfill). Race-safe guard included.
        await tx.dashboardAndHub.updateMany({
          where: {
            id: app.id,
            currentTester: { lt: 2147483647 },
          },
          data: { currentTester: { increment: 1 } },
        });

        const totalDay = app.totalDay || 16;
        const testingEndDate = new Date(
          now.getTime() + totalDay * 24 * 60 * 60 * 1000,
        );
        await tx.dashboardAndHub.update({
          where: { id: app.id },
          data: {
            status: "TESTING_ACTIVE",
            testingStartDate: now,
            testingEndDate,
            currentDay: 1,
          },
        });
      }

      return { relationA, relationB, link };
    });

    return sendSuccess(
      res,
      result as any,
      "Handshake forced by admin",
    );
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
};

// Minimum joined testers for a start request to be valid. Mirrors
// HANDSHAKE_START_REQUEST_MIN_TESTERS in hub.controller.ts (imported
// dynamically to avoid a static controller-to-controller import).
async function getStartRequestMinTesters(): Promise<number> {
  const hub = await import("./hub.controller");
  return hub.HANDSHAKE_START_REQUEST_MIN_TESTERS ?? 12;
}

/**
 * Admin: list HANDSHAKE campaigns with a pending start request
 * (status START_REQUESTED), oldest first.
 */
export const getStartRequests = async (req: Request, res: Response) => {
  try {
    const items = await prismaClient.dashboardAndHub.findMany({
      where: { appType: "HANDSHAKE", status: "START_REQUESTED" },
      orderBy: { updatedAt: "asc" },
      include: {
        appOwner: {
          select: {
            id: true,
            name: true,
            image: true,
            handshakeLevel: true,
            eliteBadge: true,
          },
        },
        androidApp: {
          select: { appName: true, appLogoUrl: true },
        },
      },
    });

    return sendSuccess(res, { items: items as any }, "ok");
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
};

/**
 * Admin: approve a pending start request. The campaign transitions to
 * TESTING_ACTIVE with fresh lifecycle dates (same fresh-cycle semantics
 * as adminForceHandshake). The 12-tester gate is re-validated — testers
 * may have dropped while the request was pending, or the campaign may
 * have filled and entered the normal WAITING window meanwhile.
 */
export const approveStartRequest = async (req: Request, res: Response) => {
  try {
    const adminId = req?.userId;
    if (!adminId) return sendError(res, 401, "Unauthorized");

    const body = req.body?.payload ?? req.body;
    const campaignId = parseInt(String(body?.campaignId || ""), 10);
    if (!campaignId || isNaN(campaignId)) {
      return sendError(res, 400, "campaignId is required");
    }

    const minTesters = await getStartRequestMinTesters();
    const now = new Date();

    // Atomic claim: only a still-pending request with enough testers wins.
    const app = await prismaClient.dashboardAndHub.findUnique({
      where: { id: campaignId },
      select: { id: true, totalDay: true, appOwnerId: true, androidApp: { select: { appName: true } } },
    });
    if (!app) return sendError(res, 404, "Campaign not found");

    const totalDay = app.totalDay || 16;
    const claim = await prismaClient.dashboardAndHub.updateMany({
      where: {
        id: campaignId,
        appType: "HANDSHAKE",
        status: "START_REQUESTED",
        currentTester: { gte: minTesters },
      },
      data: {
        status: "TESTING_ACTIVE",
        testingStartDate: now,
        testingEndDate: new Date(
          now.getTime() + totalDay * 24 * 60 * 60 * 1000,
        ),
        currentDay: 1,
        escalatedToAdminAt: null,
        // A prior rejection's remark no longer applies once approved.
        statusDetails: Prisma.DbNull,
      },
    });
    if (claim.count === 0) {
      const fresh = await prismaClient.dashboardAndHub.findUnique({
        where: { id: campaignId },
        select: { status: true, currentTester: true },
      });
      if (!fresh) return sendError(res, 404, "Campaign not found");
      if (fresh.status !== "START_REQUESTED") {
        return sendError(
          res,
          409,
          `Start request is no longer pending (campaign is ${fresh.status})`,
        );
      }
      return sendError(
        res,
        409,
        `Only ${fresh.currentTester} testers joined — ${minTesters} required to approve`,
      );
    }

    await prismaClient.notification.create({
      data: {
        title: "Start request approved",
        description: `Your request to start testing "${app.androidApp?.appName ?? `campaign #${campaignId}`}" was approved. The ${totalDay}-day testing period has begun.`,
        type: "OTHER" as const,
        userId: app.appOwnerId,
        isActive: true,
      },
    });

    return sendSuccess(
      res,
      { campaignId } as any,
      "Start request approved — testing is now active",
    );
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "handshakeMonitoring",
      action: "approveStartRequest",
      targetId: String(req?.body?.payload?.campaignId ?? req?.body?.campaignId ?? ""),
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
 * Admin: reject a pending start request. The campaign returns to
 * AVAILABLE so testers keep joining; the owner sees the mandatory
 * remark and can re-request once ready.
 */
export const rejectStartRequest = async (req: Request, res: Response) => {
  try {
    const adminId = req?.userId;
    if (!adminId) return sendError(res, 401, "Unauthorized");

    const body = req.body?.payload ?? req.body;
    const campaignId = parseInt(String(body?.campaignId || ""), 10);
    const remark = String(body?.remark || "").trim();
    if (!campaignId || isNaN(campaignId)) {
      return sendError(res, 400, "campaignId is required");
    }
    if (!remark) {
      return sendError(res, 400, "A rejection remark is required");
    }

    const app = await prismaClient.dashboardAndHub.findUnique({
      where: { id: campaignId },
      select: { appOwnerId: true, androidApp: { select: { appName: true } } },
    });
    if (!app) return sendError(res, 404, "Campaign not found");

    const now = new Date();
    const claim = await prismaClient.dashboardAndHub.updateMany({
      where: {
        id: campaignId,
        appType: "HANDSHAKE",
        status: "START_REQUESTED",
      },
      data: {
        status: "AVAILABLE",
        statusDetails: {
          title: "Start request rejected",
          description: remark,
        },
        // Re-entering AVAILABLE restarts the recruiting window (same
        // convention as updateProjectStatus for handshake campaigns).
        approvedAt: now,
        escalatedToAdminAt: null,
      },
    });
    if (claim.count === 0) {
      return sendError(
        res,
        409,
        "Start request is no longer pending",
      );
    }

    await prismaClient.notification.create({
      data: {
        title: "Start request rejected",
        description: `Your request to start testing "${app.androidApp?.appName ?? `campaign #${campaignId}`}" was rejected by an admin. Reason: ${remark}`,
        type: "OTHER" as const,
        userId: app.appOwnerId,
        isActive: true,
      },
    });

    return sendSuccess(
      res,
      { campaignId } as any,
      "Start request rejected — campaign is available again",
    );
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "handshakeMonitoring",
      action: "rejectStartRequest",
      targetId: String(req?.body?.payload?.campaignId ?? req?.body?.campaignId ?? ""),
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
