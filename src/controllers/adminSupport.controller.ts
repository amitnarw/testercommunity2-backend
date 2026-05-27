import { type Request, type Response } from "express";
import { prismaClient } from "@/lib/prisma";
import { sendError, sendSuccess } from "@/utils/response";

const SUPPORT_ROLES = ["support", "admin", "super_admin"];

export const getConversations = async (req: Request, res: Response) => {
  try {
    if (!SUPPORT_ROLES.includes(req.role || "")) {
      return sendError(res, 403, "Access denied");
    }

    const { type, status } = req.query;
    const where: any = {};

    if (type && ["LIVE_CHAT", "TICKET", "AI_CHAT"].includes(type as string)) {
      where.type = type;
    }
    if (status && ["OPEN", "IN_PROGRESS", "WAITING_AGENT", "RESOLVED", "CLOSED"].includes(status as string)) {
      where.status = status;
    }

    const conversations = await prismaClient.conversation.findMany({
      where,
      orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
      take: 100,
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        assignedAgent: { select: { id: true, name: true, image: true } },
        _count: { select: { messages: true } },
      },
    });

    return sendSuccess(res, conversations as any, "Conversations fetched");
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return sendError(res, 500, "Failed to fetch conversations");
  }
};

export const getConversationById = async (req: Request, res: Response) => {
  try {
    if (!SUPPORT_ROLES.includes(req.role || "")) {
      return sendError(res, 403, "Access denied");
    }

    const { id } = req.params;

    const conversation = await prismaClient.conversation.findUnique({
      where: { id: Number(id) },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        assignedAgent: { select: { id: true, name: true, image: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!conversation) {
      return sendError(res, 404, "Conversation not found");
    }

    return sendSuccess(res, conversation as any, "Conversation fetched");
  } catch (error) {
    console.error("Error fetching conversation:", error);
    return sendError(res, 500, "Failed to fetch conversation");
  }
};

export const assignConversation = async (req: Request, res: Response) => {
  try {
    if (!SUPPORT_ROLES.includes(req.role || "")) {
      return sendError(res, 403, "Access denied");
    }

    const { id } = req.params;
    const conversation = await prismaClient.conversation.findUnique({
      where: { id: Number(id) },
    });

    if (!conversation) {
      return sendError(res, 404, "Conversation not found");
    }

    const updated = await prismaClient.conversation.update({
      where: { id: Number(id) },
      data: {
        assignedTo: req.userId,
        status: "IN_PROGRESS",
        assignedAt: new Date(),
        firstResponseAt: conversation.firstResponseAt || new Date(),
      },
    });

    await prismaClient.agentStatus.upsert({
      where: { userId: req.userId! },
      update: { currentChats: { increment: 1 }, lastSeenAt: new Date() },
      create: { userId: req.userId!, status: "ONLINE", currentChats: 1 },
    });

    return sendSuccess(res, updated as any, "Conversation assigned");
  } catch (error) {
    console.error("Error assigning conversation:", error);
    return sendError(res, 500, "Failed to assign conversation");
  }
};

export const addConversationMessage = async (req: Request, res: Response) => {
  try {
    if (!SUPPORT_ROLES.includes(req.role || "")) {
      return sendError(res, 403, "Access denied");
    }

    const { id } = req.params;
    const { message } = req.body.payload || req.body;

    if (!message?.trim()) {
      return sendError(res, 400, "Message is required");
    }

    const conversation = await prismaClient.conversation.findUnique({
      where: { id: Number(id) },
    });

    if (!conversation) {
      return sendError(res, 404, "Conversation not found");
    }

    // Fix #12: Don't allow replying to ephemeral live chats (messages not persisted)
    if (conversation.type === "LIVE_CHAT") {
      return sendError(res, 400, "Cannot reply to an active live chat. Use the live chat interface instead.");
    }

    const saved = await prismaClient.message.create({
      data: {
        conversationId: Number(id),
        senderId: req.userId,
        senderType: "AGENT",
        messageType: "TEXT",
        content: message.trim(),
      },
    });

    const updateData: any = { lastMessageAt: new Date() };
    if (conversation.status === "RESOLVED" || conversation.status === "CLOSED") {
      updateData.status = "IN_PROGRESS";
      updateData.resolvedAt = null;
    }
    if (!conversation.assignedTo) {
      updateData.assignedTo = req.userId;
      updateData.assignedAt = new Date();
      if (!conversation.firstResponseAt) {
        updateData.firstResponseAt = new Date();
      }
    }

    await prismaClient.conversation.update({
      where: { id: Number(id) },
      data: updateData,
    });

    return sendSuccess(res, saved as any, "Message sent");
  } catch (error) {
    console.error("Error adding conversation message:", error);
    return sendError(res, 500, "Failed to send message");
  }
};

export const closeConversation = async (req: Request, res: Response) => {
  try {
    if (!SUPPORT_ROLES.includes(req.role || "")) {
      return sendError(res, 403, "Access denied");
    }

    const { id } = req.params;
    const conversation = await prismaClient.conversation.findUnique({
      where: { id: Number(id) },
    });

    if (!conversation) {
      return sendError(res, 404, "Conversation not found");
    }

    const updated = await prismaClient.conversation.update({
      where: { id: Number(id) },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
      },
    });

    if (conversation.assignedTo) {
      await prismaClient.agentStatus.update({
        where: { userId: conversation.assignedTo },
        data: { currentChats: { decrement: 1 } },
      });
    }

    return sendSuccess(res, updated as any, "Conversation resolved");
  } catch (error) {
    console.error("Error closing conversation:", error);
    return sendError(res, 500, "Failed to close conversation");
  }
};

export const getAgentStatus = async (req: Request, res: Response) => {
  try {
    if (!SUPPORT_ROLES.includes(req.role || "")) {
      return sendError(res, 403, "Access denied");
    }

    const agents = await prismaClient.agentStatus.findMany({
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
      orderBy: { lastSeenAt: "desc" },
    });

    return sendSuccess(res, agents, "Agent statuses fetched");
  } catch (error) {
    console.error("Error fetching agent statuses:", error);
    return sendError(res, 500, "Failed to fetch agent statuses");
  }
};

export const setMyStatus = async (req: Request, res: Response) => {
  try {
    if (!SUPPORT_ROLES.includes(req.role || "")) {
      return sendError(res, 403, "Access denied");
    }

    const { status } = req.body.payload || req.body;

    if (!status || !["ONLINE", "AWAY", "OFFLINE"].includes(status)) {
      return sendError(res, 400, "Valid status required (ONLINE, AWAY, OFFLINE)");
    }

    const agentStatus = await prismaClient.agentStatus.upsert({
      where: { userId: req.userId! },
      update: { status, lastSeenAt: new Date() },
      create: { userId: req.userId!, status, currentChats: 0 },
    });

    return sendSuccess(res, agentStatus, `Status set to ${status.toLowerCase()}`);
  } catch (error) {
    console.error("Error setting agent status:", error);
    return sendError(res, 500, "Failed to set status");
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

    // Note: When a LIVE_CHAT is saved as a ticket (type converted to TICKET),
    // it's counted in todayChats but NOT in todayResolved since type changed.
    // This makes resolution rate appear slightly lower for active days.
    const [
      todayChats,
      todayResolved,
      waitingInQueue,
      activeNow,
      todayTickets,
      onlineAgents,
      totalConversations,
    ] = await Promise.all([
      prismaClient.conversation.count({
        where: { type: "LIVE_CHAT", createdAt: { gte: todayStart, lte: todayEnd } },
      }),
      prismaClient.conversation.count({
        where: {
          type: "LIVE_CHAT",
          status: "RESOLVED",
          updatedAt: { gte: todayStart, lte: todayEnd },
        },
      }),
      prismaClient.conversation.count({
        where: { type: "LIVE_CHAT", status: "WAITING_AGENT" },
      }),
      prismaClient.conversation.count({
        where: { type: "LIVE_CHAT", status: "IN_PROGRESS" },
      }),
      prismaClient.conversation.count({
        where: { type: "TICKET", createdAt: { gte: todayStart, lte: todayEnd } },
      }),
      prismaClient.agentStatus.count({ where: { status: "ONLINE" } }),
      prismaClient.conversation.count(),
    ]);

    const resolvedChats = await prismaClient.conversation.findMany({
      where: {
        type: "LIVE_CHAT",
        status: "RESOLVED",
        assignedTo: { not: null },
        assignedAt: { not: null },
        createdAt: { gte: todayStart, lte: todayEnd },
      },
      select: {
        createdAt: true,
        assignedAt: true,
        firstResponseAt: true,
        resolvedAt: true,
        updatedAt: true,
        assignedTo: true,
        assignedAgent: { select: { name: true } },
      },
    });

    let avgWaitTime = 0;
    let avgChatDuration = 0;
    const agentStats: Record<string, { name: string; chats: number; resolved: number; totalResponseTime: number; responseCount: number }> = {};

    if (resolvedChats.length > 0) {
      let totalWait = 0;
      let totalDuration = 0;
      let waitCount = 0;
      let durationCount = 0;

      for (const chat of resolvedChats) {
        if (chat.assignedAt) {
          totalWait += chat.assignedAt.getTime() - chat.createdAt.getTime();
          waitCount++;
        }
        const endTime = chat.resolvedAt || chat.updatedAt;
        const startTime = chat.assignedAt || chat.createdAt;
        totalDuration += endTime.getTime() - startTime.getTime();
        durationCount++;

        if (chat.assignedTo) {
          if (!agentStats[chat.assignedTo]) {
            agentStats[chat.assignedTo] = {
              name: chat.assignedAgent?.name || "Unknown",
              chats: 0,
              resolved: 0,
              totalResponseTime: 0,
              responseCount: 0,
            };
          }
          agentStats[chat.assignedTo].chats++;
          agentStats[chat.assignedTo].resolved++;
          if (chat.firstResponseAt && chat.assignedAt) {
            agentStats[chat.assignedTo].totalResponseTime += chat.firstResponseAt.getTime() - chat.assignedAt.getTime();
            agentStats[chat.assignedTo].responseCount++;
          }
        }
      }

      avgWaitTime = waitCount > 0 ? Math.round(totalWait / waitCount) : 0;
      avgChatDuration = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0;
    }

    return sendSuccess(res, {
      todayChats,
      todayResolved,
      waitingInQueue,
      activeNow,
      todayTickets,
      onlineAgents,
      totalConversations,
      avgWaitTime,
      avgChatDuration,
      agentPerformance: Object.entries(agentStats).map(([_, a]) => ({
        name: a.name,
        chatsHandled: a.chats,
        resolved: a.resolved,
        resolutionRate: a.chats > 0 ? Math.round((a.resolved / a.chats) * 100) : 0,
        avgResponseTime: a.responseCount > 0 ? Math.round(a.totalResponseTime / a.responseCount) : 0,
      })),
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
        data: { humanChatEnabled: humanChatEnabled ?? true },
      });
    } else {
      control = await prismaClient.controlRoom.update({
        where: { id: control.id },
        data: { ...(humanChatEnabled !== undefined ? { humanChatEnabled } : {}) },
      });
    }

    return sendSuccess(res, control, "Control room updated");
  } catch (error) {
    console.error("Error updating control room:", error);
    return sendError(res, 500, "Failed to update control room");
  }
};
