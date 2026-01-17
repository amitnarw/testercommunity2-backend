import { type Request, type Response } from "express";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient } from "@/lib/prisma";

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    if (!userId) {
      return sendError(res, 400, "UserId not found");
    }
    const response = await prismaClient.user.findUnique({
      where: { id: userId },
      select: {
        wallet: { select: { totalPackages: true } },
      },
    });

    const statusCounts = await prismaClient.dashboardAndHub.groupBy({
      by: ["status"],
      where: { appOwnerId: userId },
      _count: { _all: true },
    });

    const inReviewApps = await prismaClient.dashboardAndHub.findMany({
      where: { appOwnerId: userId, status: "IN_REVIEW" },
    });

    const inReviewAppsList = inReviewApps?.map((item) => ({
      ...item,
      statusDetails: JSON.parse(JSON.stringify(item?.statusDetails)),
      updatedAt: item?.updatedAt?.toString(),
      createdAt: item?.createdAt?.toString(),
    }));

    const finalResponse = {
      wallet: response?.wallet?.totalPackages || 0,
      inReviewApps: inReviewAppsList,
      statusCounts,
    };

    return sendSuccess(res, finalResponse, "ok");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "dashboard",
      action: "getDashboardStats",
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
      auditLogPayloadFail,
    );
  }
};
