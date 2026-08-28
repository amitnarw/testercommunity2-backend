import { type Request, type Response } from "express";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient } from "@/lib/prisma";

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
          },
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
            sourceCampaign: {
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

    // P2.7: full cleanup via shared helper ,  cancels ACTIVE links,
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
      "Tester replaced ,  slot is now open",
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
        `Campaign ${appAId} is not owned by ${userAId} ,  check that userA/appA and userB/appB are correctly paired`,
      );
    }
    if (campaignB.appOwnerId !== userBId) {
      return sendError(
        res,
        400,
        `Campaign ${appBId} is not owned by ${userBId} ,  check that userA/appA and userB/appB are correctly paired`,
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
      // P2.8: route both creates through the shared upsert helper ,  a
      // REPLACED/REMOVED/DROPPED leftover row (e.g. from a prior
      // replace-tester) previously hit the unique constraint as a raw P2002,
      // breaking the exact replace→force workflow this tool advertises.
      const { upsertTesterRelation } = await import("@/lib/handshake");
      const relationA = await upsertTesterRelation(tx, {
        testerId: userBId,
        hubId: appAId,
        reactivateStatus: "IN_PROGRESS",
        assignmentSource: "ADMIN_ASSIGNED",
      });
      const relationB = await upsertTesterRelation(tx, {
        testerId: userAId,
        hubId: appBId,
        reactivateStatus: "IN_PROGRESS",
        assignmentSource: "ADMIN_ASSIGNED",
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
