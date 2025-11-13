import { prismaClient } from "@/lib/prisma";
import { sendError, sendSuccess } from "@/utils/response";
import { type Request, type Response } from "express";

export const getLogs = async (req: Request, res: Response) => {
  try {
    const { page, limit } = req.query;

    const pageNumber = page ? Number(page) : 1;
    const limitNumber = limit ? Number(limit) : 10;
    const skip = (pageNumber - 1) * limitNumber;

    const total = await prismaClient.auditLog.count();

    const logs = await prismaClient.auditLog.findMany({
      skip,
      take: limitNumber,
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            role: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        ts: "desc",
      },
    });

    return sendSuccess(res, { payload: { data: logs, total } }, "ok");
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
};

export const addLog = async (req: Request, res: Response) => {
  try {
    const { payload } = req.body;
    if (!payload) {
      return sendError(res, 400, "Payload is required");
    }

    const result = await addAuditLog(payload);
    if (!result?.success) {
      return sendError(res, 400, result?.message);
    }

    return sendSuccess(res, null, "Log added successfully");
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
};

export const addAuditLog = async (payload: {
  actorId: ObjectId;
  actorRole: string;
  module: string;
  action: string;
  targetId: ObjectId;
  result: string;
  reason?: string;
  ip: string;
  ua: string;
}): Promise<{ success: boolean; message: string }> => {
  try {
    const {
      actorId,
      actorRole,
      module,
      action,
      targetId,
      result,
      reason,
      ip,
      ua,
    } = payload;

    if (!actorId || !actorRole || !module || !action || !result || !ip || !ua) {
      return {
        success: false,
        message:
          "Actor id, actor role, module, action, result, ip, ua are required",
      };
    }
    const log = await AuditLog.create({
      actorId,
      actorRole,
      module,
      action,
      targetId,
      result,
      reason,
      ip,
      ua,
    });
    if (!log) {
      return { success: false, message: log };
    }
    return { success: true, message: "Log added successfully" };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
};
