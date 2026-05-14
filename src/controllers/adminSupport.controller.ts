import { type Request, type Response } from "express";
import { prismaClient } from "@/lib/prisma";
import { sendError, sendSuccess } from "@/utils/response";

const SUPPORT_ROLES = ["support", "admin", "super_admin"];

export const getHumanChatQueue = async (req: Request, res: Response) => {
  try {
    if (!SUPPORT_ROLES.includes(req.role || "")) {
      return sendError(res, 403, "Access denied");
    }

    const chats = await prismaClient.supportRequest.findMany({
      where: { type: "HUMAN_CHAT", status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        messages: {
          where: { isAi: true },
          take: 5,
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return sendSuccess(
      res,
      chats.map((c) => ({
        id: c.id,
        userId: c.userId,
        userName: c.user?.name || "Unknown",
        userEmail: c.user?.email || "",
        userImage: c.user?.image || null,
        createdAt: c.createdAt.toISOString(),
        isEscalated: c.isEscalated,
        aiContext: c.messages.map((m) => m.message).join("\n"),
      })),
      "Queue fetched"
    );
  } catch (error) {
    console.error("Error fetching queue:", error);
    return sendError(res, 500, "Failed to fetch queue");
  }
};

export const getAllHumanChats = async (req: Request, res: Response) => {
  try {
    if (!SUPPORT_ROLES.includes(req.role || "")) {
      return sendError(res, 403, "Access denied");
    }

    const status = req.query.status as string | undefined;
    const where: any = { type: "HUMAN_CHAT" };
    if (status) where.status = status;

    const chats = await prismaClient.supportRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        user: { select: { id: true, name: true, email: true } },
        assignedUser: { select: { id: true, name: true } },
        _count: { select: { messages: true } },
      },
    });

    return sendSuccess(res, chats, "Human chats fetched");
  } catch (error) {
    console.error("Error fetching human chats:", error);
    return sendError(res, 500, "Failed to fetch chats");
  }
};

export const getSupportStats = async (req: Request, res: Response) => {
  try {
    if (!SUPPORT_ROLES.includes(req.role || "")) {
      return sendError(res, 403, "Access denied");
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayStarted = await prismaClient.supportRequest.count({
      where: {
        type: "HUMAN_CHAT",
        createdAt: { gte: todayStart, lte: todayEnd },
      },
    });

    const todayResolved = await prismaClient.supportRequest.count({
      where: {
        type: "HUMAN_CHAT",
        status: "RESOLVED",
        updatedAt: { gte: todayStart, lte: todayEnd },
      },
    });

    const pendingInQueue = await prismaClient.supportRequest.count({
      where: { type: "HUMAN_CHAT", status: "PENDING" },
    });

    const activeNow = await prismaClient.supportRequest.count({
      where: { type: "HUMAN_CHAT", status: "IN_PROGRESS" },
    });

    const escalated = await prismaClient.supportRequest.count({
      where: { type: "HUMAN_CHAT", isEscalated: true },
    });

    const totalEscalated = await prismaClient.supportRequest.count({
      where: { type: "HUMAN_CHAT", isEscalated: true, createdAt: { gte: todayStart, lte: todayEnd } },
    });

    const todayTickets = await prismaClient.supportRequest.count({
      where: {
        type: "TICKET",
        createdAt: { gte: todayStart, lte: todayEnd },
      },
    });

    const resolvedChats = await prismaClient.supportRequest.findMany({
      where: {
        type: "HUMAN_CHAT",
        status: "RESOLVED",
        assignedTo: { not: null },
        assignedAt: { not: null },
      },
      select: {
        assignedAt: true,
        updatedAt: true,
        createdAt: true,
        assignedTo: true,
        assignedUser: { select: { id: true, name: true } },
      },
    });

    let avgWaitTime = 0;
    let avgChatDuration = 0;
    let totalResolution = 0;
    const agentStats: Record<string, { name: string; chats: number; totalResponseTime: number; resolved: number }> = {};

    if (resolvedChats.length > 0) {
      let totalWait = 0;
      let totalDuration = 0;
      let waitCount = 0;
      let durationCount = 0;

      for (const chat of resolvedChats) {
        if (chat.assignedAt) {
          const waitMs = chat.assignedAt.getTime() - chat.createdAt.getTime();
          totalWait += waitMs;
          waitCount++;
        }
        const durMs = chat.updatedAt.getTime() - (chat.assignedAt?.getTime() || chat.createdAt.getTime());
        totalDuration += durMs;
        durationCount++;

        if (chat.assignedTo) {
          const key = chat.assignedTo;
          if (!agentStats[key]) {
            agentStats[key] = {
              name: chat.assignedUser?.name || "Unknown",
              chats: 0,
              totalResponseTime: 0,
              resolved: 0,
            };
          }
          agentStats[key].chats++;
          agentStats[key].totalResponseTime += chat.assignedAt
            ? chat.assignedAt.getTime() - chat.createdAt.getTime()
            : 0;
          agentStats[key].resolved++;
        }
        totalResolution++;
      }

      avgWaitTime = waitCount > 0 ? Math.round(totalWait / waitCount) : 0;
      avgChatDuration = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0;
    }

    const agentPerformance = Object.values(agentStats).map((a) => ({
      name: a.name,
      chatsHandled: a.chats,
      avgResponseTime: a.chats > 0 ? Math.round(a.totalResponseTime / a.chats) : 0,
      resolved: a.resolved,
      resolutionRate: a.chats > 0 ? Math.round((a.resolved / a.chats) * 100) : 0,
    }));

    return sendSuccess(res, {
      todayStarted,
      todayResolved,
      pendingInQueue,
      activeNow,
      escalated: totalEscalated,
      totalEscalated: escalated,
      todayTickets,
      avgWaitTime,
      avgChatDuration,
      totalResolution,
      agentPerformance,
    }, "Stats fetched");
  } catch (error) {
    console.error("Error fetching support stats:", error);
    return sendError(res, 500, "Failed to fetch stats");
  }
};

export const updateControlRoom = async (req: Request, res: Response) => {
  try {
    if (req.role !== "super_admin") {
      return sendError(res, 403, "Only super_admin can update control room");
    }

    const { humanChatEnabled } = req.body.payload || req.body;

    let control = await prismaClient.controlRoom.findFirst();
    if (!control) {
      control = await prismaClient.controlRoom.create({
        data: {
          humanChatEnabled: humanChatEnabled ?? true,
        },
      });
    } else {
      control = await prismaClient.controlRoom.update({
        where: { id: control.id },
        data: {
          ...(humanChatEnabled !== undefined ? { humanChatEnabled } : {}),
        },
      });
    }

    return sendSuccess(res, control, "Control room updated");
  } catch (error) {
    console.error("Error updating control room:", error);
    return sendError(res, 500, "Failed to update control room");
  }
};
