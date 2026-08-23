import cron, { type ScheduledTask } from "node-cron";
import { prismaClient } from "@/lib/prisma";
import { processStagedPenalty } from "@/lib/handshake";
import { createAdminNotification } from "@/services/notifications";
import logger from "@/utils/logger";

const scheduledTasks: ScheduledTask[] = [];

/**
 * Job A: every 5 min ,  mark expired handshake requests as EXPIRED.
 * Spec §4: requests expire after `handshake_request_expiry_days`.
 */
async function expireHandshakeRequests(): Promise<void> {
  try {
    const result = await prismaClient.handshakeRequest.updateMany({
      where: {
        status: "PENDING",
        expiresAt: { lt: new Date() },
      },
      data: {
        status: "EXPIRED",
        respondedAt: new Date(),
      },
    });
    if (result.count > 0) {
      logger.info(`[cron] expired ${result.count} handshake request(s)`);
    }
  } catch (err) {
    logger.error("[cron] expireHandshakeRequests failed:", err);
  }
}

/**
 * Job B: every 15 min ,  escalate WAITING_FOR_PARTNERS > 24h campaigns to admin.
 * Spec §13, §41: after 24h, escalate to admin for intervention.
 */
async function escalateWaitingCampaigns(): Promise<void> {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const dueCampaigns = await prismaClient.dashboardAndHub.findMany({
      where: {
        status: "WAITING_FOR_PARTNERS",
        escalatedToAdminAt: null,
        waitingPeriodStartedAt: { lt: twentyFourHoursAgo },
      },
      select: {
        id: true,
        appOwnerId: true,
        waitingPeriodStartedAt: true,
      },
    });

    for (const c of dueCampaigns) {
      await prismaClient.dashboardAndHub.update({
        where: { id: c.id },
        data: { escalatedToAdminAt: new Date() },
      });
      await createAdminNotification({
        title: `Campaign ${c.id} needs admin intervention`,
        description: `Campaign ${c.id} has been waiting for partners for >24h since ${c.waitingPeriodStartedAt?.toISOString()}. Admin should consider replacement, force-handshake, or professional tester assignment.`,
        type: "ANNOUNCEMENT",
      });
    }

    if (dueCampaigns.length > 0) {
      logger.info(
        `[cron] escalated ${dueCampaigns.length} waiting campaign(s) to admin`,
      );
    }
  } catch (err) {
    logger.error("[cron] escalateWaitingCampaigns failed:", err);
  }
}

/**
 * Job C: every 30 min ,  transition WAITING_FOR_PARTNERS to TESTING_ACTIVE
 * when all partners have completed their required actions.
 */
async function transitionReadyCampaigns(): Promise<void> {
  try {
    // H-B6 (S4b-4): Only consider campaigns whose 24h waiting window has
    // elapsed (testingStartEligibleAt <= now). Without this guard, the cron
    // transitions the campaign to TESTING_ACTIVE the moment the last tester
    // accepts, bypassing the 24h waiting period entirely.
    // S6-7: HANDSHAKE-only ,  FREE/PAID campaigns activate immediately on
    // fill (legacy behavior restored in hub.controller.ts) and must never
    // sit in WAITING_FOR_PARTNERS.
    const now = new Date();
    const waiting = await prismaClient.dashboardAndHub.findMany({
      where: {
        appType: "HANDSHAKE",
        status: "WAITING_FOR_PARTNERS",
        testingStartEligibleAt: { lte: now },
      },
      include: {
        testerRelations: {
          where: { isActive: true },
          select: { id: true, status: true },
        },
      },
    });

    let count = 0;
    for (const c of waiting) {
      if (c.testerRelations.length === 0) continue;
      const allReady = c.testerRelations.every(
        (r) => r.status === "IN_PROGRESS" || r.status === "COMPLETED",
      );
      if (!allReady) continue;

      const totalDay = c.totalDay || 16;
      const testingEndDate = new Date(
        now.getTime() + totalDay * 24 * 60 * 60 * 1000,
      );

      // M8 (S4c-7 hardening): atomic update with status guard so two cron
      // instances don't re-stamp testingStartDate/count independently.
      const result = await prismaClient.dashboardAndHub.updateMany({
        where: {
          id: c.id,
          status: "WAITING_FOR_PARTNERS",
        },
        data: {
          status: "TESTING_ACTIVE",
          testingStartDate: now,
          testingEndDate,
          currentDay: 1,
        },
      });
      if (result.count > 0) count++;
    }

    if (count > 0) {
      logger.info(`[cron] transitioned ${count} campaign(s) to TESTING_ACTIVE`);
    }
  } catch (err) {
    logger.error("[cron] transitionReadyCampaigns failed:", err);
  }
}

/**
 * Job D: every 60 min ,  sweep active handshake links for missed-day penalties.
 * Spec §27: 1 miss → 1 task, 2 miss → 2 tasks, 3 miss → only failing side removed.
 */
async function sweepStagedPenalties(): Promise<void> {
  try {
    const links = await prismaClient.handshakeLink.findMany({
      where: { status: "ACTIVE" },
      select: { id: true },
    });
    for (const l of links) {
      try {
        await processStagedPenalty(l.id);
      } catch (inner) {
        logger.warn(`[cron] processStagedPenalty failed for link ${l.id}:`, inner);
      }
    }
    if (links.length > 0) {
      logger.info(`[cron] swept staged penalty for ${links.length} link(s)`);
    }
  } catch (err) {
    logger.error("[cron] sweepStagedPenalties failed:", err);
  }
}

/**
 * Job E (P4): every 30 min ,  fail overdue PenaltyTasks whose deadline has
 * passed. Deadlines were stored but never enforced, so overdue tasks blocked
 * a user's testing indefinitely until an admin acted. Failing the task lets
 * the ledger reconciliation regenerate pressure per the staged-penalty
 * design instead of leaking a permanent block.
 */
async function expireOverduePenaltyTasks(): Promise<void> {
  try {
    const result = await prismaClient.penaltyTask.updateMany({
      where: {
        status: { in: ["PENDING", "IN_PROGRESS"] },
        deadline: { lt: new Date() },
      },
      data: { status: "FAILED" },
    });
    if (result.count > 0) {
      logger.warn(
        `[cron] auto-failed ${result.count} overdue penaltyTask(s) past their deadline`,
      );
    }
  } catch (err) {
    logger.error("[cron] expireOverduePenaltyTasks failed:", err);
  }
}

/**
 * Schedule all handshake-related cron jobs. Called once at server startup.
 * Jobs are gated: only run in production or when ENABLE_HANDSHAKE_CRON=1.
 */
export function scheduleHandshakeCrons(): void {
  const enabled =
    process.env.NODE_ENV === "production" ||
    process.env.ENABLE_HANDSHAKE_CRON === "1";

  if (!enabled) {
    // P4: this was an info log that nobody saw ,  a prod deploy started
    // without NODE_ENV=production silently disabled expiry, transitions and
    // penalty sweeps. Make it loud.
    logger.warn(
      "[cron] handshake cron jobs DISABLED ,  requests will never expire, full campaigns will never leave WAITING_FOR_PARTNERS and penalties will never sweep. Set ENABLE_HANDSHAKE_CRON=1 or NODE_ENV=production!",
    );
    return;
  }

  if (scheduledTasks.length > 0) {
    logger.warn("[cron] handshake cron jobs already scheduled; skipping");
    return;
  }

  scheduledTasks.push(
    cron.schedule("*/5 * * * *", expireHandshakeRequests),
    cron.schedule("*/15 * * * *", escalateWaitingCampaigns),
    cron.schedule("*/30 * * * *", transitionReadyCampaigns),
    cron.schedule("0 * * * *", sweepStagedPenalties),
    cron.schedule("*/30 * * * *", expireOverduePenaltyTasks),
  );

  logger.info(
    "[cron] handshake cron jobs scheduled: expire (5m), escalate (15m), transition (30m), sweep (60m), penalty-expiry (30m)",
  );
}

export function stopHandshakeCrons(): void {
  for (const t of scheduledTasks) {
    try {
      t.stop();
    } catch (err) {
      logger.warn("[cron] error stopping task:", err);
    }
  }
  scheduledTasks.length = 0;
}
