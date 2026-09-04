import { type Request, type Response } from "express";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient } from "@/lib/prisma";

interface AwardEliteBadgeBody {
  userId: string;
  reason?: string | null;
}

interface ListHoldersQuery {
  page?: string;
  limit?: string;
  search?: string;
}

interface ActivityQuery {
  page?: string;
  limit?: string;
  action?: string;
}

interface UserSearchQuery {
  query?: string;
  limit?: string;
}

const ACTIONS = {
  AWARD: "AWARD",
  REVOKE: "REVOKE",
} as const;

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
    if (target.eliteBadge) {
      return sendError(res, 409, "User already has the Elite Badge");
    }

    const trimmedReason = reason?.trim() || null;

    const result = await prismaClient.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          eliteBadge: true,
          eliteBadgeAwardedAt: new Date(),
          eliteBadgeAwardedBy: adminId,
          eliteBadgeReason: trimmedReason,
        },
      });
      await tx.eliteBadgeAuditLog.create({
        data: {
          userId,
          adminId,
          action: ACTIONS.AWARD,
          reason: trimmedReason,
        },
      });
      return updated;
    });

    return sendSuccess(
      res,
      { userId: result.id, eliteBadge: true },
      "Elite Badge awarded",
    );
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
 * Spec §2.2: admin revokes the Elite Badge. Reason is required for audit.
 */
export const revokeEliteBadge = async (req: Request, res: Response) => {
  try {
    const adminId = req?.userId;
    if (!adminId) return sendError(res, 401, "Unauthorized");

    const body: AwardEliteBadgeBody = req.body?.payload ?? req.body;
    const { userId, reason } = body ?? {};
    if (!userId) return sendError(res, 400, "userId is required");
    const trimmedReason = reason?.trim();
    if (!trimmedReason) {
      return sendError(res, 400, "A reason is required when revoking an Elite Badge");
    }

    const target = await prismaClient.user.findUnique({
      where: { id: userId },
      select: { id: true, eliteBadge: true },
    });
    if (!target) return sendError(res, 404, "User not found");
    if (!target.eliteBadge) {
      return sendError(res, 409, "User does not have the Elite Badge");
    }

    const result = await prismaClient.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          eliteBadge: false,
          eliteBadgeAwardedAt: null,
          eliteBadgeAwardedBy: null,
          eliteBadgeReason: null,
        },
      });
      await tx.eliteBadgeAuditLog.create({
        data: {
          userId,
          adminId,
          action: ACTIONS.REVOKE,
          reason: trimmedReason,
        },
      });
      return updated;
    });

    return sendSuccess(
      res,
      { userId: result.id, eliteBadge: false },
      "Elite Badge revoked",
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

/**
 * Admin: lightweight user search for the badge picker.
 */
export const searchEliteBadgeUsers = async (req: Request, res: Response) => {
  try {
    const query = String(req?.query?.query || "").trim();
    const limit = Math.min(
      50,
      Math.max(1, parseInt(String(req?.query?.limit || "20"), 10)),
    );

    const where: any = {};
    if (query) {
      where.OR = [
        { name: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
      ];
    }

    const users = await prismaClient.user.findMany({
      where,
      take: limit,
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        handshakeLevel: true,
        eliteBadge: true,
      },
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
 * Admin: paginated list of users currently holding the Elite Badge.
 */
export const listEliteBadgeHolders = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req?.query?.page || "1"), 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req?.query?.limit || "20"), 10)),
    );
    const search = String(req?.query?.search || "").trim();
    const skip = (page - 1) * limit;

    const where: any = { eliteBadge: true };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      prismaClient.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { eliteBadgeAwardedAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          handshakeLevel: true,
          handshakeCompletedCount: true,
          eliteBadge: true,
          eliteBadgeAwardedAt: true,
          eliteBadgeReason: true,
        },
      }),
      prismaClient.user.count({ where }),
    ]);

    return sendSuccess(
      res,
      {
        items,
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
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
 * Admin: paginated badge award/revoke activity log.
 */
export const listEliteBadgeActivity = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req?.query?.page || "1"), 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req?.query?.limit || "20"), 10)),
    );
    const actionFilter = String(req?.query?.action || "").trim().toUpperCase();
    const skip = (page - 1) * limit;

    const where: any = {};
    if (actionFilter === ACTIONS.AWARD || actionFilter === ACTIONS.REVOKE) {
      where.action = actionFilter;
    }

    const [items, total, stats] = await Promise.all([
      prismaClient.eliteBadgeAuditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              handshakeLevel: true,
              eliteBadge: true,
            },
          },
          admin: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      }),
      prismaClient.eliteBadgeAuditLog.count({ where }),
      Promise.all([
        prismaClient.eliteBadgeAuditLog.count({
          where: {
            action: ACTIONS.AWARD,
            createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        }),
        prismaClient.eliteBadgeAuditLog.count({
          where: {
            action: ACTIONS.REVOKE,
            createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        }),
        prismaClient.user.count({ where: { eliteBadge: true } }),
      ]),
    ]);

    return sendSuccess(
      res,
      {
        items,
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        stats: {
          totalHolders: stats[2],
          awardsLast30d: stats[0],
          revokesLast30d: stats[1],
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
