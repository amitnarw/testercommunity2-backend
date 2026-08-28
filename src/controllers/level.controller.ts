import { type Request, type Response } from "express";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient } from "@/lib/prisma";
import {
  getUserLevelProgress,
} from "@/lib/handshake";
import { getAllLevels } from "@/lib/levelConfig";

/**
 * Spec §32-35: get the current user's level, completed count, progress,
 * slots available, and elite badge status.
 */
export const getMyLevel = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    if (!userId) return sendError(res, 401, "Unauthorized");

    const progress = await getUserLevelProgress(userId);

    return sendSuccess(
      res,
      {
        ...progress,
        currentThreshold: progress.nextThreshold
          ? progress.completedCount
          : 0,
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
 * Top users by level and completed count.
 */
export const getLeaderboard = async (req: Request, res: Response) => {
  try {
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req?.query?.limit || "50"), 10)),
    );

    const top = await prismaClient.user.findMany({
      where: { handshakeCompletedCount: { gt: 0 } },
      orderBy: [
        { handshakeLevel: "desc" },
        { handshakeCompletedCount: "desc" },
      ],
      take: limit,
      select: {
        id: true,
        name: true,
        image: true,
        handshakeLevel: true,
        handshakeCompletedCount: true,
        eliteBadge: true,
      },
    });

    return sendSuccess(res, { items: top }, "ok");
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
};

/**
 * Spec §33: full LevelConfig table (for UI display / leaderboard tiers).
 */
export const getLevelConfig = async (req: Request, res: Response) => {
  try {
    const items = await getAllLevels();
    return sendSuccess(res, { items }, "ok");
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
};
