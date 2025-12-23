import { type Request, type Response } from "express";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient } from "@/lib/prisma";

export const getHubStats = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    if (!userId) {
      return sendError(res, 400, "UserId not found");
    }

    const response = await prismaClient.user.findUnique({
      where: { id: userId },
      select: {
        wallet: { select: { totalPoints: true } },
      },
    });

    const statusCounts = await prismaClient.dashboardAndHub.groupBy({
      by: ["status"],
      where: { currentTester: userId },
      _count: { _all: true },
    });

    const availableApps = await prismaClient.dashboardAndHub.findMany({
      where: { currentTester: userId, status: "AVAILABLE" },
    });

    const finalResponse = {
      wallet: response?.wallet?.totalPoints || 0,
      availableApps,
      statusCounts,
    };

    return sendSuccess(res, finalResponse, "ok");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "hub",
      action: "getHubStats",
      targetId: req?.userId || "",
      result: "fail",
      reason: error instanceof Error ? error.message : "Unknown error",
      ip: req?.userIpAddress || "",
      ua: req?.userAgent || "",
    };
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
      auditLogPayloadFail
    );
  }
};
