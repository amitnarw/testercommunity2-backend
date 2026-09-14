import { type Request, type Response } from "express";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient } from "@/lib/prisma";
import { normalizeR2Url } from "@/utils/helperFunctions";
import {
  getPenaltyBlockState,
  penaltyDayNumber,
} from "@/lib/handshake";

/**
 * Spec §29, §30: list the current user's active penalties.
 * A penalty page is the primary available page when this returns items.
 */
export const getMyPenalties = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    if (!userId) return sendError(res, 401, "Unauthorized");

    const items = await prismaClient.penaltyTask.findMany({
      where: {
        userId,
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
      orderBy: { assignedAt: "desc" },
      include: {
        sourceCampaign: {
          select: {
            id: true,
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
        taskApp: {
          select: {
            id: true,
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
    });

    const completed = await prismaClient.penaltyTask.count({
      where: { userId, status: "COMPLETED" },
    });
    const failed = await prismaClient.penaltyTask.count({
      where: { userId, status: "FAILED" },
    });

    // Daily-aware block state (spec: completing today's penalty testing
    // unlocks access for that day). The frontend layout gate keys on
    // `blocked`, not `isPenalized`.
    const { blocked } = await getPenaltyBlockState(userId);

    // Per-task daily progress for the penalty page (assigned-app card,
    // 16-day grid, today's check-in state).
    const now = new Date();
    const active = await Promise.all(
      items.map(async (t: any) => {
        if (!t.taskAppId || !t.penaltyStartAt) return t;
        const required = t.penaltyDaysRequired || 16;
        const today = penaltyDayNumber(t.penaltyStartAt, now);
        const proofs = await prismaClient.penaltyDailyProof.findMany({
          where: { penaltyTaskId: t.id, status: "VERIFIED" },
          select: { dayNumber: true },
        });
        const doneDays = proofs.map((p) => p.dayNumber);
        return {
          ...t,
          penaltyProgress: {
            required,
            currentDay: Math.min(Math.max(today, 1), required),
            proofsCount: doneDays.length,
            doneDays,
            // Spec: a daily check-in on day 1+ opens at task creation; after
            // the required days (16) the window is over and the user must
            // wait for admin review. Surfacing the unclamped `today` so the
            // frontend can hide the check-in affordance (a backend 409 would
            // otherwise render a permanently clickable "Submit today's proof"
            // button).
            windowOver: today > required,
            todayDone:
              today >= 1 && today <= required && doneDays.includes(today),
          },
        };
      }),
    );

    return sendSuccess(
      res,
      {
        active,
        completed,
        failed,
        isPenalized: items.length > 0,
        blocked,
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

interface SubmitProofBody {
  proofImageUrl: string;
}

/**
 * User submits proof for a penalty task. Status moves to IN_PROGRESS.
 */
export const submitPenaltyProof = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    const id = parseInt(String(req?.params?.taskId || ""), 10);
    if (!userId) return sendError(res, 401, "Unauthorized");
    if (!id || isNaN(id)) return sendError(res, 400, "taskId is required");

    const body: SubmitProofBody = req.body?.payload ?? req.body;
    const proofImageUrl = String(body?.proofImageUrl || "").trim();
    if (!proofImageUrl) {
      return sendError(res, 400, "proofImageUrl is required");
    }

    const task = await prismaClient.penaltyTask.findUnique({ where: { id } });
    if (!task) return sendError(res, 404, "Penalty task not found");
    if (task.userId !== userId) {
      return sendError(res, 403, "Cannot submit proof for another user's task");
    }
    if (task.status !== "PENDING" && task.status !== "IN_PROGRESS") {
      return sendError(
        res,
        400,
        `Cannot submit proof in status ${task.status}`,
      );
    }

    await prismaClient.penaltyTask.update({
      where: { id },
      data: {
        status: "IN_PROGRESS",
        proofImageUrl,
      },
    });

    return sendSuccess(res, { id }, "Proof submitted — awaiting admin verification");
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
};

interface AssignPenaltyAppBody {
  campaignId: number;
}

/**
 * Admin: assign an app to a penalty task, starting its 16-day penalty
 * testing window (spec: "testing app assigned by admin for 16 days").
 * Sets taskAppId + penaltyStartAt, flips the task IN_PROGRESS, and extends
 * the deadline to cover the window plus grace.
 */
export const assignPenaltyApp = async (req: Request, res: Response) => {
  try {
    const adminId = req?.userId;
    const id = parseInt(String(req?.params?.taskId || ""), 10);
    if (!adminId) return sendError(res, 401, "Unauthorized");
    if (!id || isNaN(id)) return sendError(res, 400, "taskId is required");

    const body: AssignPenaltyAppBody = req.body?.payload ?? req.body;
    const campaignId = Number(body?.campaignId);
    if (!campaignId || isNaN(campaignId)) {
      return sendError(res, 400, "campaignId is required");
    }

    const task = await prismaClient.penaltyTask.findUnique({ where: { id } });
    if (!task) return sendError(res, 404, "Penalty task not found");
    if (task.status !== "PENDING" && task.status !== "IN_PROGRESS") {
      return sendError(
        res,
        409,
        `Task is already ${task.status} and cannot be assigned`,
      );
    }
    // Spec integrity: a task can only receive one app. Re-assignment would
    // shift penaltyStartAt under existing daily proofs (day numbers change)
    // and re-extend the deadline forever. Force admins to fail/expire the
    // existing assignment first.
    if (task.taskAppId) {
      return sendError(
        res,
        409,
        "Task already has an assigned app. Expire or fail it before re-assigning.",
      );
    }
    // R5f: if the source relation is already terminal, serving the penalty
    // task against it is pointless (the relation is REPLACED/REMOVED/
    // DROPPED). The orphan sweep will EXPIRE this task within the hour
    // anyway; reject early so admins don't waste time configuring.
    if (task.sourceRelationId) {
      const sourceRel = await prismaClient.testerRelation.findUnique({
        where: { id: task.sourceRelationId },
        select: { status: true },
      });
      if (
        sourceRel &&
        ["REPLACED", "REMOVED", "DROPPED"].includes(sourceRel.status)
      ) {
        return sendError(
          res,
          409,
          `Task's source relation is ${sourceRel.status} — it will be swept expired shortly; no point assigning.`,
        );
      }
    }

    const app = await prismaClient.dashboardAndHub.findUnique({
      where: { id: campaignId },
      select: { id: true, status: true, appOwnerId: true },
    });
    if (!app) return sendError(res, 404, "Campaign not found");
    // Status allow-list: dead campaigns (DRAFT/IN_REVIEW/REJECTED/
    // SUSPENDED/REMOVED/ON_HOLD/UNDER_ADMIN_REVIEW/COMPLETED) cannot take
    // a penalty assignment.
    const statusAllow = new Set([
      "AVAILABLE",
      "FINDING_TESTERS",
      "WAITING_FOR_PARTNERS",
      "TESTING_ACTIVE",
      "IN_TESTING",
    ]);
    if (!statusAllow.has(app.status)) {
      return sendError(
        res,
        409,
        `Cannot assign app from a campaign in status ${app.status}`,
      );
    }
    // Owner self-test loop: a user testing their own app is meaningless
    // and corrupts both the campaign counter and the slot cap.
    if (app.appOwnerId === task.userId) {
      return sendError(
        res,
        409,
        "Cannot assign the user's own campaign as their penalty app",
      );
    }

    const now = new Date();
    const required = task.penaltyDaysRequired || 16;
    const updated = await prismaClient.penaltyTask.update({
      where: { id },
      data: {
        taskAppId: campaignId,
        penaltyStartAt: now,
        status: "IN_PROGRESS",
        verifiedByAdminId: adminId,
        // Window + grace so the overdue-fail cron doesn't kill a task
        // mid-testing; the 3-miss path handles genuine abandonment.
        deadline: new Date(now.getTime() + (required + 7) * 24 * 60 * 60 * 1000),
      },
    });

    await prismaClient.notification.create({
      data: {
        title: "Penalty app assigned",
        description: `An admin assigned you a penalty app to test for ${required} days with daily check-ins. Complete today's testing to restore access.`,
        type: "OTHER",
        userId: task.userId,
        isActive: true,
      },
    });

    return sendSuccess(res, { id, status: updated.status }, "Penalty app assigned");
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
};

interface SubmitPenaltyDailyProofBody {
  proofImageUrl: string;
}

/**
 * User submits today's daily proof for an assigned penalty app.
 * Proofs are auto-verified on upload (like campaign daily verifications)
 * so that completing today's testing unlocks access immediately.
 * When verified proofs reach the required day count, the task completes;
 * when it is the last open task for its source relation, testing is
 * restored (same as admin approval path).
 */
export const submitPenaltyDailyProof = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    const id = parseInt(String(req?.params?.taskId || ""), 10);
    if (!userId) return sendError(res, 401, "Unauthorized");
    if (!id || isNaN(id)) return sendError(res, 400, "taskId is required");

    const body: SubmitPenaltyDailyProofBody = req.body?.payload ?? req.body;
    const proofImageUrl = String(body?.proofImageUrl || "").trim();
    if (!proofImageUrl) {
      return sendError(res, 400, "proofImageUrl is required");
    }

    const task = await prismaClient.penaltyTask.findUnique({ where: { id } });
    if (!task) return sendError(res, 404, "Penalty task not found");
    if (task.userId !== userId) {
      return sendError(res, 403, "Cannot submit proof for another user's task");
    }
    if (task.status !== "IN_PROGRESS") {
      return sendError(
        res,
        400,
        `Cannot submit proof in status ${task.status}`,
      );
    }
    if (!task.taskAppId || !task.penaltyStartAt) {
      return sendError(
        res,
        400,
        "No penalty app assigned yet — wait for an admin to assign one",
      );
    }

    const required = task.penaltyDaysRequired || 16;
    const dayNumber = penaltyDayNumber(task.penaltyStartAt);
    if (dayNumber < 1) {
      return sendError(res, 425, "Penalty testing has not started yet.");
    }
    if (dayNumber > required) {
      return sendError(
        res,
        409,
        "Penalty testing window is over — an admin will review your task",
      );
    }

    const existing = await prismaClient.penaltyDailyProof.findUnique({
      where: { penaltyTaskId_dayNumber: { penaltyTaskId: id, dayNumber } },
    });
    if (existing) {
      return sendError(
        res,
        409,
        `Proof for day ${dayNumber} already submitted.`,
      );
    }

    const result = await prismaClient.$transaction(async (tx) => {
      await tx.penaltyDailyProof.create({
        data: {
          penaltyTaskId: id,
          dayNumber,
          proofImageUrl: normalizeR2Url(proofImageUrl),
          status: "VERIFIED",
          verifiedAt: new Date(),
        },
      });

      const verifiedCount = await tx.penaltyDailyProof.count({
        where: { penaltyTaskId: id, status: "VERIFIED" },
      });

      let taskCompleted = false;
      if (verifiedCount >= required) {
        // R5e: status guard prevents a race with the hourly orphan-expiry
        // cron (or any admin action) from flipping an EXPIRED/FAILED task
        // back to COMPLETED here. count === 0 → already moved off
        // IN_PROGRESS; skip the update.
        const completionUpdate = await tx.penaltyTask.updateMany({
          where: { id, status: "IN_PROGRESS" },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
        if (completionUpdate.count === 0) {
          // Race: someone (orphan sweep, admin action) already terminated
          // this task. Skip the restore too — it would resurrect a dead
          // relation per the S7-6 guard below.
          return { dayNumber, verifiedCount, taskCompleted: false };
        }
        taskCompleted = true;

        if (task.sourceRelationId) {
          // S7-6 guard (mirrors verifyPenaltyTask): an approval is meaningless
          // once the source relation was REPLACED or its campaign REMOVED ,
          // resurrecting it would put a dead user on a dead campaign. Keep
          // the task COMPLETED (work served) but skip the test restore.
          const sourceRelation = await tx.testerRelation.findUnique({
            where: { id: task.sourceRelationId },
            select: {
              status: true,
              dashboardAndHub: { select: { status: true } },
            },
          });
          const relationTerminal =
            sourceRelation?.status === "REPLACED" ||
            sourceRelation?.status === "REMOVED" ||
            sourceRelation?.status === "DROPPED";
          const campaignTerminal =
            sourceRelation?.dashboardAndHub?.status === "REMOVED";

          const remaining = await tx.penaltyTask.count({
            where: {
              sourceRelationId: task.sourceRelationId,
              status: { in: ["PENDING", "IN_PROGRESS"] },
            },
          });
          if (remaining === 0 && !relationTerminal && !campaignTerminal) {
            await tx.missedDay.deleteMany({
              where: { testerRelationId: task.sourceRelationId },
            });
            await tx.testerRelation.update({
              where: { id: task.sourceRelationId },
              data: { status: "IN_PROGRESS" },
            });
          }
        }
      }

      return { dayNumber, verifiedCount, taskCompleted };
    });

    return sendSuccess(
      res,
      { id, ...result },
      result.taskCompleted
        ? "Penalty testing complete — access restored"
        : "Today's penalty testing submitted — access restored for today",
    );
  } catch (error) {
    // P2002 = unique constraint: two concurrent daily-proof submits raced
    // past the pre-tx duplicate check. Re-check inside the tx or via a
    // direct lookup so we return a friendly 409 instead of a 400 with the
    // raw Prisma message.
    if (error && (error as any)?.code === "P2002") {
      return sendError(
        res,
        409,
        "A proof for this day has already been submitted.",
      );
    }
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
};

interface VerifyPenaltyBody {
  approved: boolean;
  rejectionReason?: string | null;
}

/**
 * Admin verifies or rejects a submitted penalty task.
 */
export const verifyPenaltyTask = async (req: Request, res: Response) => {
  try {
    const adminId = req?.userId;
    const id = parseInt(String(req?.params?.taskId || ""), 10);
    if (!adminId) return sendError(res, 401, "Unauthorized");
    if (!id || isNaN(id)) return sendError(res, 400, "taskId is required");

    const body: VerifyPenaltyBody = req.body?.payload ?? req.body;
    if (typeof body?.approved !== "boolean") {
      return sendError(res, 400, "approved (boolean) is required");
    }

    const task = await prismaClient.penaltyTask.findUnique({ where: { id } });
    if (!task) return sendError(res, 404, "Penalty task not found");

    // S7-6: only open tasks are verifiable — blocks re-verdict flips
    // (COMPLETED↔FAILED) that would corrupt the served-ledger cleanup, and
    // proof-less approvals of stale tasks.
    if (task.status !== "PENDING" && task.status !== "IN_PROGRESS") {
      return sendError(
        res,
        409,
        `Task is already ${task.status} and can no longer be verified`,
      );
    }

    // S7-6: an approval is meaningless once the source relation was REPLACED
    // or its campaign REMOVED — reject the action instead of resurrecting a
    // zombie participant on a dead campaign.
    if (body.approved && task.sourceRelationId) {
      const relation = await prismaClient.testerRelation.findUnique({
        where: { id: task.sourceRelationId },
        select: {
          status: true,
          dashboardAndHub: { select: { status: true } },
        },
      });
      const relationTerminal =
        !relation ||
        relation.status === "REPLACED" ||
        relation.status === "REMOVED" ||
        relation.status === "DROPPED";
      if (relationTerminal) {
        return sendError(
          res,
          409,
          `This task's testing relation is ${relation?.status ?? "missing"} — the task is obsolete`,
        );
      }
      if (relation.dashboardAndHub?.status === "REMOVED") {
        return sendError(
          res,
          409,
          "This task's campaign was removed — the task is obsolete",
        );
      }
    }

    const newStatus = body.approved ? "COMPLETED" : "FAILED";

    // S6-3: wrap the whole service flow in a transaction. When the LAST
    // active task for a relation is approved, also delete that relation's
    // MissedDay rows — without this, the next hourly sweep sees
    // missedCount >= 1 with zero open tasks and re-penalizes the user
    // forever (permanent 423 block).
    await prismaClient.$transaction(async (tx) => {
      await tx.penaltyTask.update({
        where: { id },
        data: {
          status: newStatus,
          verifiedByAdminId: adminId,
          completedAt: body.approved ? new Date() : null,
          proofImageUrl: body.approved ? task.proofImageUrl : null,
        },
      });

      if (body.approved && task.sourceRelationId) {
        const remaining = await tx.penaltyTask.count({
          where: {
            sourceRelationId: task.sourceRelationId,
            status: { in: ["PENDING", "IN_PROGRESS"] },
          },
        });
        if (remaining === 0) {
          // Fully served — clear the missed-day ledger and restore testing.
          // R5d: skip the resurrection if the relation is already terminal
          // (REPLACED / REMOVED / DROPPED) — the relation guard above caught
          // approvals but the restore path runs for any approval; double-check
          // inside the tx in case the relation status changed between the
          // pre-tx check and the tx commit (race with adminReplaceTester).
          const sourceRel = await tx.testerRelation.findUnique({
            where: { id: task.sourceRelationId },
            select: { status: true },
          });
          const isTerminal =
            !sourceRel ||
            sourceRel.status === "REPLACED" ||
            sourceRel.status === "REMOVED" ||
            sourceRel.status === "DROPPED";
          if (isTerminal) return;
          await tx.missedDay.deleteMany({
            where: { testerRelationId: task.sourceRelationId },
          });
          await tx.testerRelation.update({
            where: { id: task.sourceRelationId },
            data: { status: "IN_PROGRESS" },
          });
        }
      }
    });

    return sendSuccess(
      res,
      { id, status: newStatus },
      body.approved ? "Penalty task approved" : "Penalty task rejected",
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
 * Admin: list all penalty tasks with filters.
 */
export const listAllPenalties = async (req: Request, res: Response) => {
  try {
    const status = req?.query?.status ? String(req.query.status) : undefined;
    const userId = req?.query?.userId ? String(req.query.userId) : undefined;
    const page = Math.max(1, parseInt(String(req?.query?.page || "1"), 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req?.query?.limit || "50"), 10)),
    );

    const where: any = {};
    if (status) where.status = status;
    if (userId) where.userId = userId;

    const [items, total] = await Promise.all([
      prismaClient.penaltyTask.findMany({
        where,
        orderBy: { assignedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
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
      }),
      prismaClient.penaltyTask.count({ where }),
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
