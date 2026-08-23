import { prismaClient } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  getLevelFromCompletedCount,
  getLevelProgress,
  invalidateLevelConfigCache,
  MAX_HANDSHAKE_LEVEL,
} from "@/lib/levelConfig";
import { createAdminNotification, createUserNotification } from "@/services/notifications";
import logger from "@/utils/logger";

export { MAX_HANDSHAKE_LEVEL };

export const BASE_HANDSHAKE_SLOTS = 12;

type TxClient = Prisma.TransactionClient;

const ACTIVE_RELATION_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "MISSED",
  "PENALIZED",
];

/**
 * S7-3: single source of truth for creating-or-reusing a TesterRelation on a
 * campaign, shared by the v2 handshake-request path and the legacy join path.
 *
 * - No row            -> create with `reactivateStatus`.
 * - Active row        -> throw __ALREADY_PARTICIPATING__ (caller maps to 409).
 * - Terminal row      -> supersede any old terminal HandshakeLink referencing
 *                        it (link.relationAId/relationBId are @unique), wipe
 *                      prior-cycle state (verifications + missed days), reset
 *                      the row, and set it back to `reactivateStatus`.
 */
export async function upsertTesterRelation(
  tx: TxClient,
  opts: {
    testerId: string;
    hubId: number;
    reactivateStatus: "PENDING" | "IN_PROGRESS";
    offeredAppId?: number | null;
    assignmentSource?: "SELF_JOIN" | "ADMIN_ASSIGNED";
  },
): Promise<{ id: number }> {
  const { testerId, hubId, reactivateStatus } = opts;
  const existing = await tx.testerRelation.findUnique({
    where: {
      testerId_dashboardAndHubId: {
        testerId,
        dashboardAndHubId: hubId,
      },
    },
    select: { id: true, status: true },
  });

  if (!existing) {
    return tx.testerRelation.create({
      data: {
        testerId,
        dashboardAndHubId: hubId,
        status: reactivateStatus,
        isActive: true,
        daysCompleted: 0,
        ...(opts.offeredAppId !== undefined
          ? { offeredAppId: opts.offeredAppId }
          : {}),
        ...(opts.assignmentSource ? { assignmentSource: opts.assignmentSource } : {}),
      },
      select: { id: true },
    });
  }

  if (ACTIVE_RELATION_STATUSES.includes(existing.status)) {
    throw new Error("__ALREADY_PARTICIPATING__");
  }

  const superseded = await tx.handshakeLink.findFirst({
    where: {
      OR: [
        { relationAId: existing.id },
        { relationBId: existing.id },
      ],
    },
    select: { id: true, status: true },
  });
  if (superseded?.status === "ACTIVE") {
    throw new Error("__ALREADY_PARTICIPATING__");
  }
  if (superseded) {
    await tx.handshakeLink.delete({ where: { id: superseded.id } });
  }

  await tx.dailyTesterVerification.deleteMany({
    where: { testerRelationId: existing.id },
  });
  await tx.missedDay.deleteMany({
    where: { testerRelationId: existing.id },
  });

  return tx.testerRelation.update({
    where: { id: existing.id },
    data: {
      status: reactivateStatus,
      isActive: true,
      daysCompleted: 0,
      completedAt: null,
      lastActivityAt: null,
      // S8-G1: fresh cycle — clear the previous cycle's miss disqualification.
      hadMissSinceStart: false,
      // Nullable JSON columns require DbNull (not JS null).
      statusDetails: Prisma.DbNull,
      ...(opts.offeredAppId !== undefined
        ? { offeredAppId: opts.offeredAppId }
        : {}),
    },
    select: { id: true },
  });
}


/**
 * Per-user slot cap: 12 at L1, +1 per level, capped at MAX (9 → 20).
 */
export function getAvailableSlots(level: number): number {
  const lvl = Math.min(Math.max(level, 1), MAX_HANDSHAKE_LEVEL);
  return lvl + (BASE_HANDSHAKE_SLOTS - 1);
}

/**
 * Count of currently active handshake agreements a user participates in.
 */
export async function getActiveHandshakeCount(userId: string): Promise<number> {
  return await prismaClient.handshakeLink.count({
    where: {
      status: "ACTIVE",
      OR: [
        { relationA: { testerId: userId } },
        { relationB: { testerId: userId } },
      ],
    },
  });
}

/**
 * Compute current day number from testing start date (1-indexed).
 */
export function computeCurrentDay(testingStartDate: Date | null): number {
  if (!testingStartDate) return 0;
  const start = new Date(testingStartDate).getTime();
  const now = Date.now();
  const diffDays = Math.floor((now - start) / (24 * 60 * 60 * 1000));
  return diffDays + 1;
}

/**
 * Returns true if the user has submitted verification for the given day number
 * on the provided relation.
 */
export async function hasVerificationForDay(
  relationId: number,
  dayNumber: number,
): Promise<boolean> {
  const count = await prismaClient.dailyTesterVerification.count({
    where: {
      testerRelationId: relationId,
      dayNumber,
    },
  });
  return count > 0;
}

/**
 * Records a MissedDay row (idempotent via unique constraint) and stamps the
 * S8-G1 `hadMissSinceStart` flag so this cycle's completion can no longer
 * count toward the tester's level upgrade. The flag intentionally SURVIVES
 * served-ledger cleanup (S6-3 deletes MissedDay rows once penalties are
 * served — the disqualification must persist).
 */
export async function recordMissedDay(
  testerRelationId: number,
  dayNumber: number,
): Promise<void> {
  await prismaClient.missedDay.upsert({
    where: {
      testerRelationId_dayNumber: {
        testerRelationId,
        dayNumber,
      },
    },
    create: { testerRelationId, dayNumber },
    update: {},
  });
  await prismaClient.testerRelation.update({
    where: { id: testerRelationId },
    data: { hadMissSinceStart: true },
  });
}

/**
 * Count distinct missed days for a tester relation.
 */
export async function getMissedDayCount(
  testerRelationId: number,
): Promise<number> {
  return prismaClient.missedDay.count({ where: { testerRelationId } });
}

/**
 * Count active penalties (PENDING + IN_PROGRESS) for a user.
 */
export async function getActivePenaltyCount(userId: string): Promise<number> {
  return prismaClient.penaltyTask.count({
    where: { userId, status: { in: ["PENDING", "IN_PROGRESS"] } },
  });
}

/**
 * Assign a PenaltyTask to a user. Returns the new task.
 */
export async function assignPenaltyTask(opts: {
  userId: string;
  sourceRelationId?: number | null;
  sourceCampaignId?: number | null;
  reason: string;
  taskAppId?: number | null;
  deadlineDays?: number;
}): Promise<void> {
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + (opts.deadlineDays ?? 7));
  await prismaClient.penaltyTask.create({
    data: {
      userId: opts.userId,
      sourceRelationId: opts.sourceRelationId ?? null,
      sourceCampaignId: opts.sourceCampaignId ?? null,
      taskAppId: opts.taskAppId ?? null,
      reason: opts.reason,
      deadline,
      status: "PENDING",
    },
  });
}

/**
 * Spec §27: staged penalty on missed testing days.
 *   1 miss → 1 PenaltyTask (status PENALIZED on the relation)
 *   2 miss → 2 PenaltyTasks
 *   3 miss → only the failing side's app marked REMOVED; partner unaffected
 *
 * This function processes all days that have fully elapsed since lastProcessedDay
 * and applies penalty increments.
 */
export async function processStagedPenalty(linkId: number): Promise<void> {
  const link = await prismaClient.handshakeLink.findUnique({
    where: { id: linkId },
    include: {
      relationA: { include: { dashboardAndHub: true } },
      relationB: { include: { dashboardAndHub: true } },
    },
  });
  if (!link || link.status !== "ACTIVE") return;

  const appA = link.relationA.dashboardAndHub;
  const appB = link.relationB.dashboardAndHub;
  if (!appA || !appB) return;
  if (appA.status !== "TESTING_ACTIVE" || appB.status !== "TESTING_ACTIVE") {
    return;
  }

  const dayA = computeCurrentDay(appA.testingStartDate);
  const dayB = computeCurrentDay(appB.testingStartDate);
  // P2.5: never treat days beyond a campaign's own required window
  // (totalDay) as missed ,  a stalled side must not accrue penalties for
  // days that were never part of its testing period.
  const totalA = appA.totalDay || 16;
  const totalB = appB.totalDay || 16;

  // P2.7: truly terminated sides (admin-replaced / removed / dropped) must
  // never accrue NEW missed days or penalty tasks ,  admin intervention wins
  // over the sweep. Per-side on purpose: the other (active) side of the
  // agreement keeps flowing normally. COMPLETED sides are NOT skipped ,
  // their pre-completion ledger must still reconcile into tasks as before.
  const sweepTerminated = ["REPLACED", "REMOVED", "DROPPED"];
  const aTerminated = sweepTerminated.includes(link.relationA.status);
  const bTerminated = sweepTerminated.includes(link.relationB.status);

  let nextLastProcessed = link.lastProcessedDay;

  for (let day = link.lastProcessedDay + 1; day < Math.min(dayA, dayB); day++) {
    if (day <= totalA && !aTerminated) {
      const aSubmitted = await hasVerificationForDay(link.relationAId, day);
      if (!aSubmitted) {
        await recordMissedDay(link.relationAId, day);
      }
    }
    if (day <= totalB && !bTerminated) {
      const bSubmitted = await hasVerificationForDay(link.relationBId, day);
      if (!bSubmitted) {
        await recordMissedDay(link.relationBId, day);
      }
    }
    nextLastProcessed = day;
  }

  // S5c-1/S6: penalty writes are reconciled against the lifetime ledger
  // (needed = missedCount − openTasks) inside each side's transaction, so the
  // cursor advance below is safe even when one side's tx failed ,  its ledger
  // rows survive and tasks top-up on a later successful pass.
  //
  // S7-8: advance unconditionally. The old both-sides-ok gating froze the
  // cursor on partial failure, which combined with S6-3's served-ledger
  // cleanup re-penalized already-served days (regeneration edge).
  if (!aTerminated) {
    await applyStagedPenaltyForRelation(
      link.relationAId,
      link.relationA.testerId,
      link.relationB.dashboardAndHubId as number,
    );
  }
  if (!bTerminated) {
    await applyStagedPenaltyForRelation(
      link.relationBId,
      link.relationB.testerId,
      link.relationA.dashboardAndHubId as number,
    );
  }

  if (nextLastProcessed > link.lastProcessedDay) {
    await prismaClient.handshakeLink.update({
      where: { id: linkId },
      data: { lastProcessedDay: nextLastProcessed },
    });
  }
}

/**
 * Apply 1/2/3 → staged penalty for a single relation.
 * 1 miss → 1 PenaltyTask + status PENALIZED
 * 2 miss → 2nd PenaltyTask
 * 3 miss → only this relation's source app REMOVED + admin notification
 *        (partner's app untouched, per decision)
 *
 * H-B4 (S4c-1): All DB writes wrapped in a single transaction with serializable
 * isolation so two concurrent sweeps (cron + page-load invocation) cannot
 * create duplicate PenaltyTasks.
 *
 * H-B9 (S4c-6): 3-miss path also sets the parent HandshakeLink.status to
 * CANCELLED so the relation stops counting toward the user's slot cap.
 *
 * S6-3/S7-8: Returns { ok, removed }. The caller no longer gates the
 * lastProcessedDay cursor on `ok` ,  task creation reconciles against the
 * lifetime ledger, so a failed side's tasks top-up on a later pass and the
 * cursor can advance safely every run. `removed` drives admin/partner
 * notifications (only when THIS call performed the removal). Retries once on
 * Postgres serialization conflict (Prisma P2034 / raw 40001/40P01).
 */
async function applyStagedPenaltyForRelation(
  testerRelationId: number,
  testerUserId: string,
  campaignId: number,
): Promise<{ ok: boolean; removed: boolean }> {
  const missedCount = await getMissedDayCount(testerRelationId);
  if (missedCount === 0) return { ok: true, removed: false };

  // S7-4: partner users to notify AFTER the tx commits.
  const partnersToNotify: string[] = [];

  const maxAttempts = 2;
  let attempts = 0;
  while (attempts < maxAttempts) {
    attempts += 1;
    let removed = false;
    try {
      await prismaClient.$transaction(
        async (tx) => {
          const relation = await tx.testerRelation.findUnique({
            where: { id: testerRelationId },
            select: {
              status: true,
              dashboardAndHubId: true,
              handshakeLinkAsA: { select: { id: true, status: true } },
              handshakeLinkAsB: { select: { id: true, status: true } },
            },
          });
          if (!relation) return;

          if (missedCount >= 3) {
            // S7-6: close any still-open penalty tasks for this relation so a
            // later admin approval can't resurrect the REPLACED user on the
            // removed campaign.
            await tx.penaltyTask.updateMany({
              where: {
                sourceRelationId: testerRelationId,
                status: { in: ["PENDING", "IN_PROGRESS"] },
              },
              data: { status: "EXPIRED" },
            });

            if (relation.status !== "REPLACED") {
              await tx.testerRelation.update({
                where: { id: testerRelationId },
                data: { status: "REPLACED", isActive: false },
              });
            }

            const campaign = await tx.dashboardAndHub.findUnique({
              where: { id: campaignId },
              select: { id: true, status: true },
            });
            if (campaign && campaign.status !== "REMOVED") {
              await tx.dashboardAndHub.update({
                where: { id: campaignId },
                data: { status: "REMOVED" },
              });
              // Only true when THIS call performed the transition ,  prevents
              // duplicate admin notifications on every subsequent sweep.
              removed = true;

              // S7-4: the innocent partner was mid-testing the removed
              // campaign. Free their relation (so they aren't stuck against a
              // REMOVED status forever) and queue a notification explaining
              // what happened and how to proceed.
              const links = await tx.handshakeLink.findMany({
                where: {
                  OR: [
                    { relationAId: testerRelationId },
                    { relationBId: testerRelationId },
                  ],
                },
                select: {
                  relationAId: true,
                  relationBId: true,
                  relationA: {
                    select: { id: true, testerId: true, dashboardAndHubId: true, status: true },
                  },
                  relationB: {
                    select: { id: true, testerId: true, dashboardAndHubId: true, status: true },
                  },
                },
              });
              for (const l of links) {
                const partnerRel =
                  l.relationAId === testerRelationId ? l.relationB : l.relationA;
                if (
                  !partnerRel ||
                  partnerRel.id === testerRelationId ||
                  partnerRel.dashboardAndHubId !== campaignId
                ) {
                  continue;
                }
                if (
                  ["REMOVED", "REPLACED", "DROPPED", "COMPLETED"].includes(
                    partnerRel.status,
                  )
                ) {
                  continue;
                }
                await tx.testerRelation.update({
                  where: { id: partnerRel.id },
                  data: {
                    status: "REMOVED",
                    isActive: false,
                    statusDetails: {
                      reason:
                        "Campaign removed because its owner missed 3 required testing days.",
                      removedAt: new Date().toISOString(),
                    },
                  },
                });
                partnersToNotify.push(partnerRel.testerId);
              }
            }

            // H-B9 + S6-6: cancel ALL links referencing this relation so it
            // stops counting toward slot caps (was: stuck ACTIVE forever).
            if (relation.handshakeLinkAsA) {
              await tx.handshakeLink.updateMany({
                where: { id: relation.handshakeLinkAsA.id, status: "ACTIVE" },
                data: { status: "CANCELLED" },
              });
            }
            if (relation.handshakeLinkAsB) {
              await tx.handshakeLink.updateMany({
                where: { id: relation.handshakeLinkAsB.id, status: "ACTIVE" },
                data: { status: "CANCELLED" },
              });
            }
            return;
          }

          if (relation.status !== "PENALIZED") {
            await tx.testerRelation.update({
              where: { id: testerRelationId },
              data: { status: "PENALIZED" },
            });
          }

          // H-B4: atomic count + create inside transaction prevents
          // double-creation across concurrent sweeps.
          const existingTasks = await tx.penaltyTask.count({
            where: {
              userId: testerUserId,
              sourceRelationId: testerRelationId,
              status: { in: ["PENDING", "IN_PROGRESS"] },
            },
          });

          const needed = missedCount - existingTasks;
          for (let i = 0; i < needed; i++) {
            const deadline = new Date();
            deadline.setDate(deadline.getDate() + 7);
            await tx.penaltyTask.create({
              data: {
                userId: testerUserId,
                sourceRelationId: testerRelationId,
                sourceCampaignId: campaignId,
                reason: `Missed day ${existingTasks + i + 1} of required testing (staged penalty)`,
                deadline,
                status: "PENDING",
              },
            });
          }
        },
        {
          // SERIALIZABLE prevents two concurrent sweeps from both seeing
          // existingTasks = 0 and both creating N tasks.
          isolationLevel: "Serializable" as any,
        },
      );

      // Notification fires AFTER successful commit, only when this call
      // performed the removal ,  failure here never rolls back penalties.
      if (removed) {
        try {
          // S6-2 semantics: `campaignId` is the FAILING TESTER'S OWN campaign
          // (the one just removed), not the app they were supposed to test.
          await createAdminNotification({
            title: `Campaign REMOVED after 3 missed days`,
            description: `Tester ${testerUserId} missed 3 days of required testing. Their own campaign ${campaignId} has been removed from Handshake Testing; the partner's app is unaffected.`,
            type: "ANNOUNCEMENT",
          });
        } catch (err) {
          logger.warn("[stagedPenalty] admin notification failed:", err);
        }

        // S7-4: tell the innocent partner their testing task was removed and
        // what happens next.
        for (const partnerUserId of partnersToNotify) {
          try {
            await createUserNotification(partnerUserId, {
              title: `A campaign you were testing was removed`,
              description: `Campaign ${campaignId} was removed because its owner missed 3 required testing days. Your progress on it has been closed; an admin can assign you a new partner or campaign at any time.`,
              type: "GENERAL_MESSAGE",
            });
          } catch (err) {
            logger.warn(
              `[stagedPenalty] partner notification failed for ${partnerUserId}:`,
              err,
            );
          }
        }
      }
      return { ok: true, removed };
    } catch (err: any) {
      // S5c-2: Prisma wraps Postgres serialization failures as P2034.
      const isSerialization =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2034";
      const rawCode = err?.code;
      const retryable =
        isSerialization || rawCode === "40001" || rawCode === "40P01";
      if (retryable && attempts < maxAttempts) {
        await new Promise((r) => setTimeout(r, 20 * attempts));
        continue;
      }
      if (retryable) {
        logger.warn(
          `[stagedPenalty] serialization conflict persisted for relation ${testerRelationId}; will retry next sweep`,
        );
      } else {
        logger.error(
          `[stagedPenalty] failed for relation ${testerRelationId}:`,
          err,
        );
      }
      return { ok: false, removed: false };
    }
  }
  return { ok: false, removed: false };
}

/**
 * P2.7: full-cleanup termination of a tester relation by an admin
 * (replace / remove). Fixes the old behavior that only flipped the relation
 * status and left behind:
 *   - an ACTIVE HandshakeLink (replaced user kept consuming a slot cap and
 *     the hourly sweep kept penalizing them),
 *   - an inflated campaign currentTester ("slot is now open" was a lie),
 *   - an innocent partner stuck against a dead agreement forever.
 *
 * Inside one SERIALIZABLE tx this:
 *   1. flips the target relation to `terminalStatus` (+statusDetails),
 *   2. cancels every ACTIVE link referencing it,
 *   3. decrements its campaign's currentTester (floor 0),
 *   4. frees the innocent partner (relation REMOVED + counter decrement).
 *
 * Returns { partnerUserIds, freedCampaignIds } so callers can report what
 * actually happened. Notifications are sent post-commit here.
 */
export const TERMINAL_RELATION_STATUSES = [
  "COMPLETED",
  "REMOVED",
  "REPLACED",
  "DROPPED",
];

/** Counter-decrement statuses: relations that were accepted into testing. */
const COUNTED_STATUSES = ["IN_PROGRESS", "MISSED", "PENALIZED", "COMPLETED"];

export async function adminTerminateRelation(opts: {
  relationId: number;
  adminId: string;
  terminalStatus: "REPLACED" | "REMOVED";
  reason: string;
}): Promise<{ partnerUserIds: string[]; freedCampaignIds: number[] }> {
  const { relationId, adminId, terminalStatus, reason } = opts;
  const nowIso = new Date().toISOString();
  const partnerUserIds: string[] = [];
  const freedCampaignIds: number[] = [];

  await prismaClient.$transaction(
    async (tx) => {
      const relation = await tx.testerRelation.findUnique({
        where: { id: relationId },
        include: {
          dashboardAndHub: true,
          handshakeLinkAsA: true,
          handshakeLinkAsB: true,
        },
      });
      if (!relation) throw new Error("__RELATION_NOT_FOUND__");

      // Idempotency: already-terminated relations are left untouched so
      // double-clicks / retries never double-free slots.
      if (
        TERMINAL_RELATION_STATUSES.includes(relation.status) ||
        !relation.isActive
      ) {
        return;
      }

      await tx.testerRelation.update({
        where: { id: relation.id },
        data: {
          status: terminalStatus,
          isActive: false,
          statusDetails: {
            ...((relation.statusDetails as object) ?? {}),
            [terminalStatus === "REPLACED" ? "replacedBy" : "removedBy"]:
              adminId,
            [`${terminalStatus.toLowerCase()}At`]: nowIso,
            reason: reason || `Admin ${terminalStatus.toLowerCase()}`,
          },
        },
      });

      // H-B9 pattern: cancel ALL active links referencing this relation.
      for (const link of [relation.handshakeLinkAsA, relation.handshakeLinkAsB]) {
        if (!link) continue;
        const cancelled = await tx.handshakeLink.updateMany({
          where: { id: link.id, status: "ACTIVE" },
          data: { status: "CANCELLED" },
        });
        if (
          cancelled.count > 0 &&
          relation.dashboardAndHubId !== null &&
          !freedCampaignIds.includes(relation.dashboardAndHubId)
        ) {
          freedCampaignIds.push(relation.dashboardAndHubId);
        }
      }

      // Free the slot this relation occupied.
      if (
        COUNTED_STATUSES.includes(relation.status) &&
        relation.dashboardAndHubId !== null
      ) {
        await tx.dashboardAndHub.updateMany({
          where: { id: relation.dashboardAndHubId, currentTester: { gt: 0 } },
          data: { currentTester: { decrement: 1 } },
        });
        if (!freedCampaignIds.includes(relation.dashboardAndHubId)) {
          freedCampaignIds.push(relation.dashboardAndHubId);
        }
      }

      // S7-4 pattern: free the innocent partner instead of leaving them
      // stranded against a CANCELLED link they can never finalize.
      const activeLinks = [
        relation.handshakeLinkAsA,
        relation.handshakeLinkAsB,
      ].filter((l): l is NonNullable<typeof l> => !!l && l.status === "ACTIVE");
      for (const link of activeLinks) {
        const partnerRel =
          link.relationAId === relation.id
            ? await tx.testerRelation.findUnique({
                where: { id: link.relationBId },
              })
            : await tx.testerRelation.findUnique({
                where: { id: link.relationAId },
              });
        if (
          !partnerRel ||
          TERMINAL_RELATION_STATUSES.includes(partnerRel.status) ||
          !partnerRel.isActive
        ) {
          continue;
        }
        await tx.testerRelation.update({
          where: { id: partnerRel.id },
          data: {
            status: "REMOVED",
            isActive: false,
            statusDetails: {
              ...((partnerRel.statusDetails as object) ?? {}),
              reason: `Agreement closed by an administrator (${reason || "partner replaced"}). You are free to start a new handshake.`,
              removedAt: nowIso,
            },
          },
        });
        // Free the partner's slot on their own campaign too.
        if (partnerRel.dashboardAndHubId !== null) {
          await tx.dashboardAndHub.updateMany({
            where: {
              id: partnerRel.dashboardAndHubId,
              currentTester: { gt: 0 },
            },
            data: { currentTester: { decrement: 1 } },
          });
          if (!freedCampaignIds.includes(partnerRel.dashboardAndHubId)) {
            freedCampaignIds.push(partnerRel.dashboardAndHubId);
          }
        }
        partnerUserIds.push(partnerRel.testerId);
      }
    },
    { isolationLevel: "Serializable" as any },
  );

  // Post-commit notifications (failures logged, never fatal).
  try {
    await createAdminNotification({
      title: `Tester ${opts.terminalStatus.toLowerCase()} by admin`,
      description: `Relation ${relationId} was set to ${opts.terminalStatus}. Links cancelled, slots freed${partnerUserIds.length ? `, ${partnerUserIds.length} partner(s) released` : ""}.`,
      type: "ANNOUNCEMENT",
    });
  } catch (err) {
    logger.warn("[adminTerminateRelation] admin notification failed:", err);
  }
  for (const partnerUserId of partnerUserIds) {
    try {
      await createUserNotification(partnerUserId, {
        title: "Your handshake agreement was closed",
        description:
          "An administrator ended your current testing agreement. Your slot has been freed ,  you can start a new handshake right away.",
        type: "GENERAL_MESSAGE",
      });
    } catch (err) {
      logger.warn(
        `[adminTerminateRelation] partner notification failed for ${partnerUserId}:`,
        err,
      );
    }
  }

  return { partnerUserIds, freedCampaignIds };
}

/**
 * S8-G4: cancel every PENDING handshake request still targeting a campaign
 * that just became full (WAITING_FOR_PARTNERS stamp). Runs inside the same
 * transaction that stamped the campaign so requesters never see a stale
 * actionable request against a full campaign.
 */
export async function cancelPendingRequestsForCampaign(
  tx: TxClient,
  campaignId: number,
  now: Date,
  excludeRequestIds: number[] = [],
): Promise<void> {
  await tx.handshakeRequest.updateMany({
    where: {
      status: "PENDING",
      OR: [{ requestedAppId: campaignId }, { offeredAppId: campaignId }],
      ...(excludeRequestIds.length > 0
        ? { id: { notIn: excludeRequestIds } }
        : {}),
    },
    data: {
      status: "CANCELLED",
      respondedAt: now,
      rejectionReason:
        "Campaign filled before your request was processed — please send a new handshake with a different app",
    },
  });
}

/**
 * P2.1: single source of truth for turning a MATCHED pair into a live
 * handshake. Shared by the v2 mutual auto-match path AND the accept path so
 * both get identical validation, slot caps, lifecycle stamping, and
 * request-cancellation semantics.
 *
 * MUST be called inside a SERIALIZABLE transaction. Throws sentinel errors
 * that callers map to friendly HTTP responses:
 *   __SLOT_FULL__              a campaign filled up concurrently
 *   __ALREADY_PARTICIPATING__  a user already participates in one campaign
 *   __SLOTS_EXHAUSTED__        a user is at/over their per-level slot cap
 *
 * S6-1 mapping convention:
 *   A = requester  -> tests requestedAppId (owned by ownerId)
 *   B = owner      -> tests offeredAppId  (owned by requesterId)
 */
export async function createMutualHandshake(
  tx: TxClient,
  opts: {
    requesterId: string;
    ownerId: string;
    requestedAppId: number;
    offeredAppId: number;
    /** Request rows belonging to this match , never cancelled by S8-G4. */
    excludeRequestIds?: number[];
  },
): Promise<{ relationAId: number; relationBId: number }> {
  const {
    requesterId,
    ownerId,
    requestedAppId,
    offeredAppId,
    excludeRequestIds = [],
  } = opts;

  // 1. Fresh in-tx read of BOTH campaigns with recruiting allow-list.
  const campaigns = await tx.dashboardAndHub.findMany({
    where: {
      id: { in: [requestedAppId, offeredAppId] },
      appType: "HANDSHAKE",
      status: { in: ["AVAILABLE", "FINDING_TESTERS"] },
    },
    select: {
      id: true,
      appOwnerId: true,
      currentTester: true,
      totalTester: true,
    },
  });
  const byId = new Map(campaigns.map((c) => [c.id, c]));

  const requested = byId.get(requestedAppId);
  if (!requested || requested.totalTester <= 0) throw new Error("__SLOT_FULL__");
  if (requested.appOwnerId !== ownerId) {
    throw new Error("__INVALID_CAMPAIGN__");
  }

  const offered = byId.get(offeredAppId);
  if (!offered || offered.totalTester <= 0) throw new Error("__SLOT_FULL__");
  if (offered.appOwnerId !== requesterId) {
    throw new Error("__INVALID_CAMPAIGN__");
  }

  // 2. H4 fix: enforce the per-user slot cap for BOTH participants inside the
  // transaction (12@L1 +1/level). Previously only the legacy join path did.
  const participants: Array<{ id: string; slotsFor: number }> = [];
  for (const userId of [requesterId, ownerId]) {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { handshakeLevel: true },
    });
    const level = user?.handshakeLevel || 1;
    const slots = getAvailableSlots(level);
    const activeCount = await tx.handshakeLink.count({
      where: {
        status: "ACTIVE",
        OR: [
          { relationA: { testerId: userId } },
          { relationB: { testerId: userId } },
        ],
      },
    });
    if (activeCount >= slots) throw new Error("__SLOTS_EXHAUSTED__");
    participants.push({ id: userId, slotsFor: slots });
  }

  // 3. Relations (create-or-reuse; blocks duplicates, resets old cycles).
  const relationA = await upsertTesterRelation(tx, {
    testerId: requesterId,
    hubId: requestedAppId,
    reactivateStatus: "IN_PROGRESS",
  });
  const relationB = await upsertTesterRelation(tx, {
    testerId: ownerId,
    hubId: offeredAppId,
    reactivateStatus: "IN_PROGRESS",
  });

  // 4. The link itself.
  await tx.handshakeLink.create({
    data: {
      relationAId: relationA.id,
      relationBId: relationB.id,
      status: "ACTIVE",
    },
  });

  // 5. Bridge into the campaign lifecycle: atomic conditional increments,
  // then WAITING_FOR_PARTNERS + 24h eligibility stamped from POST-increment
  // state with an explicit allow-list (S5b-2/S6-6), plus S8-G4 cancellation
  // of other pending requests targeting each just-filled campaign.
  const now = new Date();
  for (const id of [requestedAppId, offeredAppId]) {
    const snapshot = byId.get(id)!;
    const inc = await tx.dashboardAndHub.updateMany({
      where: {
        id,
        status: { in: ["AVAILABLE", "FINDING_TESTERS"] },
        currentTester: { lt: snapshot.totalTester },
      },
      data: { currentTester: { increment: 1 } },
    });
    if (inc.count === 0) throw new Error("__SLOT_FULL__");

    const fresh = await tx.dashboardAndHub.findUnique({
      where: { id },
      select: { currentTester: true, totalTester: true, status: true },
    });
    if (
      fresh &&
      fresh.totalTester > 0 &&
      fresh.currentTester >= fresh.totalTester &&
      (fresh.status === "AVAILABLE" || fresh.status === "FINDING_TESTERS")
    ) {
      await tx.dashboardAndHub.updateMany({
        where: {
          id,
          status: { in: ["AVAILABLE", "FINDING_TESTERS"] },
          currentTester: { gte: fresh.totalTester },
        },
        data: {
          status: "WAITING_FOR_PARTNERS",
          waitingPeriodStartedAt: now,
          testingStartEligibleAt: new Date(
            now.getTime() + 24 * 60 * 60 * 1000,
          ),
        },
      });
      await cancelPendingRequestsForCampaign(
        tx,
        id,
        now,
        excludeRequestIds,
      );
    }
  }

  return { relationAId: relationA.id, relationBId: relationB.id };
}

/**
 * Read a SystemConfig value as number (with default).
 */
export async function getSystemConfigNumber(
  key: string,
  defaultValue: number,
): Promise<number> {
  const row = await prismaClient.systemConfig.findUnique({ where: { key } });
  if (!row) return defaultValue;
  const v = (row.value as unknown as number | string | undefined);
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    return isNaN(n) ? defaultValue : n;
  }
  return defaultValue;
}

/**
 * Increment handshake completed count for a user and recompute their level
 * against the spec §33 LevelConfig thresholds.
 *
 * Spec §34: only count if HandshakeLink.status === COMPLETED (already gated
 * by the caller via checkAndFinalizeHandshake).
 *
 * H-B5 (S4c-2): Uses Prisma's atomic `{ increment: 1 }` operator to prevent
 * lost-update race when two callers finalize simultaneously.
 */
export async function incrementHandshakeCompletion(
  userId: string,
): Promise<void> {
  try {
    await prismaClient.user.update({
      where: { id: userId },
      data: { handshakeCompletedCount: { increment: 1 } },
    });

    const user = await prismaClient.user.findUnique({
      where: { id: userId },
      select: { handshakeCompletedCount: true },
    });
    if (!user) return;

    const newLevel = await getLevelFromCompletedCount(
      user.handshakeCompletedCount,
    );
    invalidateLevelConfigCache();

    await prismaClient.user.updateMany({
      where: {
        id: userId,
        handshakeCompletedCount: user.handshakeCompletedCount,
      },
      data: { handshakeLevel: newLevel },
    });
  } catch (err) {
    logger.error(
      `[incrementHandshakeCompletion] failed for user ${userId}:`,
      err,
    );
  }
}

/**
 * If both sides of a handshake have COMPLETED, mark the link COMPLETED and
 * increment both users' successful-handshake counters.
 *
 * H-B5 (S4c-3): Atomic conditional update on link status (`where: status="ACTIVE"`)
 * + atomic user-level increment prevents double-finalization races.
 */
export async function checkAndFinalizeHandshake(
  linkId: number,
): Promise<void> {
  try {
    const link = await prismaClient.handshakeLink.findUnique({
      where: { id: linkId },
      include: { relationA: true, relationB: true },
    });
  if (!link || link.status !== "ACTIVE") return;

    if (
      link.relationA?.status !== "COMPLETED" ||
      link.relationB?.status !== "COMPLETED"
    ) {
      return;
    }

    const result = await prismaClient.handshakeLink.updateMany({
      where: { id: linkId, status: "ACTIVE" },
      data: { status: "COMPLETED" },
    });
    if (result.count === 0) return; // another caller won

    // S8-G1 (spec note): a tester who missed even ONE required day in this
    // cycle still finishes the handshake, but it does not count as a
    // successful test for their level upgrade. Gate each side independently
    // on its own flag.
    if (!link.relationA.hadMissSinceStart) {
      await incrementHandshakeCompletion(link.relationA.testerId);
    } else {
      logger.info(
        `[finalize] link ${linkId}: relationA ${link.relationAId} missed days — level credit denied for ${link.relationA.testerId}`,
      );
    }
    if (!link.relationB.hadMissSinceStart) {
      await incrementHandshakeCompletion(link.relationB.testerId);
    } else {
      logger.info(
        `[finalize] link ${linkId}: relationB ${link.relationBId} missed days — level credit denied for ${link.relationB.testerId}`,
      );
    }
  } catch (err) {
    logger.error(
      `[checkAndFinalizeHandshake] failed for link ${linkId}:`,
      err,
    );
  }
}

/**
 * Convenience: return level + progress for a user.
 */
export async function getUserLevelProgress(userId: string): Promise<{
  level: number;
  completedCount: number;
  nextThreshold: number | null;
  percent: number;
  remaining: number;
  slots: number;
  eliteBadge: boolean;
}> {
  const user = await prismaClient.user.findUnique({
    where: { id: userId },
    select: {
      handshakeLevel: true,
      handshakeCompletedCount: true,
      eliteBadge: true,
    },
  });
  const count = user?.handshakeCompletedCount ?? 0;
  const progress = await getLevelProgress(count);
  const slots = getAvailableSlots(progress.level);
  return {
    ...progress,
    eliteBadge: user?.eliteBadge ?? false,
    slots,
  };
}

export { getLevelProgress };
