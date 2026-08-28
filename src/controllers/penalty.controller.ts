import { type Request, type Response } from "express";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient } from "@/lib/prisma";

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

    return sendSuccess(
      res,
      {
        active: items,
        completed,
        failed,
        isPenalized: items.length > 0,
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

    return sendSuccess(res, { id }, "Proof submitted ,  awaiting admin verification");
  } catch (error) {
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

    // S7-6: only open tasks are verifiable ,  blocks re-verdict flips
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
    // or its campaign REMOVED ,  reject the action instead of resurrecting a
    // zombie participant on a dead campaign.
    if (body.approved && task.sourceRelationId) {
      const relation = await prismaClient.testerRelation.findUnique({
        where: { id: task.sourceRelationId },
        select: {
          status: true,
          dashboardAndHub: { select: { status: true } },
        },
      });
      if (!relation || relation.status === "REPLACED") {
        return sendError(
          res,
          409,
          "This task's testing relation has been replaced ,  the task is obsolete",
        );
      }
      if (relation.dashboardAndHub?.status === "REMOVED") {
        return sendError(
          res,
          409,
          "This task's campaign was removed ,  the task is obsolete",
        );
      }
    }

    const newStatus = body.approved ? "COMPLETED" : "FAILED";

    // S6-3: wrap the whole service flow in a transaction. When the LAST
    // active task for a relation is approved, also delete that relation's
    // MissedDay rows ,  without this, the next hourly sweep sees
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
          // Fully served ,  clear the missed-day ledger and restore testing.
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
