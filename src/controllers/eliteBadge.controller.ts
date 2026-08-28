import { type Request, type Response } from "express";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient } from "@/lib/prisma";

interface AwardEliteBadgeBody {
  userId: string;
  reason?: string | null;
}

/**
 * Spec §2.2: admin awards the optional Elite Badge (visual only).
 */
export const awardEliteBadge = async (req: Request, res: Response) => {
  try {
    const adminId = req?.userId;
    if (!adminId) return sendError(res, 401, "Unauthorized");

    const body: AwardEliteBadgeBody = req.body?.payload ?? req.body;
    const { userId, reason } = body ?? {};
    if (!userId) return sendError(res, 400, "userId is required");

    const target = await prismaClient.user.findUnique({
      where: { id: userId },
      select: { id: true, eliteBadge: true },
    });
    if (!target) return sendError(res, 404, "User not found");

    await prismaClient.user.update({
      where: { id: userId },
      data: {
        eliteBadge: true,
        eliteBadgeAwardedAt: new Date(),
        eliteBadgeAwardedBy: adminId,
        eliteBadgeReason: reason ?? null,
      },
    });

    return sendSuccess(res, { userId, eliteBadge: true }, "Elite Badge awarded");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "eliteBadge",
      action: "awardEliteBadge",
      targetId: String(req?.body?.payload?.userId || ""),
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
 * Spec §2.2: admin revokes the Elite Badge.
 */
export const revokeEliteBadge = async (req: Request, res: Response) => {
  try {
    const adminId = req?.userId;
    if (!adminId) return sendError(res, 401, "Unauthorized");

    const body: AwardEliteBadgeBody = req.body?.payload ?? req.body;
    const { userId, reason } = body ?? {};
    if (!userId) return sendError(res, 400, "userId is required");

    await prismaClient.user.update({
      where: { id: userId },
      data: {
        eliteBadge: false,
        eliteBadgeAwardedAt: null,
        eliteBadgeAwardedBy: null,
        eliteBadgeReason: reason ?? null,
      },
    });

    return sendSuccess(res, { userId, eliteBadge: false }, "Elite Badge revoked");
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
};

/**
 * Public read: get a user's Elite Badge status.
 */
export const getUserEliteBadge = async (req: Request, res: Response) => {
  try {
    const userId = String(req?.params?.userId || "");
    if (!userId) return sendError(res, 400, "userId is required");

    const target = await prismaClient.user.findUnique({
      where: { id: userId },
      select: {
        eliteBadge: true,
        eliteBadgeAwardedAt: true,
        eliteBadgeReason: true,
        name: true,
      },
    });
    if (!target) return sendError(res, 404, "User not found");

    return sendSuccess(
      res,
      {
        userId,
        eliteBadge: target.eliteBadge,
        awardedAt: target.eliteBadgeAwardedAt,
        reason: target.eliteBadgeReason,
        userName: target.name,
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
