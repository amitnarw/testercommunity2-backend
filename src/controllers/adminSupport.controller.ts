import { type Request, type Response } from "express";
import { prismaClient } from "@/lib/prisma";
import { type JSONValue } from "@/utils/encryptDecryptPayload";
import { sendError, sendSuccess } from "@/utils/response";

export const getConversations = async (req: Request, res: Response) => {
  try {

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
    const payload = req.body.payload || req.body;

    const allowedFields = [
       "pointsWithdrawalLimit", "pointsWithdrawalThreshold",
       "humanChatEnabled", "countriesSupported", "bugsFound", "proAppsTested",
       "platformUptime", "uniqueDevices", "fastTurnaround",
       "landingHeading", "landingSubheading",
       "landingStatTitles", "landingStatDescriptions", "landingStatValues",
       "landingStatIcons",
       "alexSystemPrompt",
     ];
   const LANDING_STAT_IDS = [
     "countriesSupported", "bugsFound", "proAppsTested",
     "platformUptime", "uniqueDevices", "fastTurnaround",
   ];
    const ALLOWED_ICONS = new Set([
      "Activity","Award","BadgeCheck","Banknote","BarChart","Bell","Bookmark","Bug",
      "Calendar","Camera","CheckCircle","Clock","Cloud","Code","Coins","CreditCard",
      "Crown","Cpu","DollarSign","Flag","Gamepad2","Gift","GitBranch","Globe",
      "Headphones","Heart","Hourglass","Keyboard","Laptop","LineChart","Mail",
      "Megaphone","MessageSquare","Monitor","Mouse","PieChart","Rocket","Send",
      "Server","Settings","Shield","ShieldCheck","Smartphone","Smile","Sparkles",
      "Star","Tablet","Tag","Target","Terminal","ThumbsUp","Timer","TrendingDown",
      "TrendingUp","Trophy","UserCheck","UserPlus","Users","Wallet","Wifi","Wrench","Zap",
    ]);
    function sanitizeStatArray(field: "title" | "description" | "value" | "icon", raw: unknown): Array<{ id: string; title?: string; description?: string; value?: string; icon?: string }> | null {
      if (raw === null || raw === undefined) return null;
      if (!Array.isArray(raw)) return null;
      const out: Array<{ id: string; title?: string; description?: string; value?: string; icon?: string }> = [];
      for (const entry of raw as Array<{ id?: unknown; title?: unknown; description?: unknown; value?: unknown; icon?: unknown }>) {
        if (typeof entry?.id !== "string" || !LANDING_STAT_IDS.includes(entry.id)) continue;
        const item: { id: string; title?: string; description?: string; value?: string; icon?: string } = { id: entry.id };
        if (field === "title") {
          item.title = typeof entry?.title === "string" ? entry.title : typeof entry?.title === "number" ? String(entry.title) : undefined;
        }
        if (field === "description") {
          item.description = typeof entry?.description === "string" ? entry.description : typeof entry?.description === "number" ? String(entry.description) : undefined;
        }
        if (field === "value") {
          item.value = typeof entry?.value === "string" && String(entry.value).trim() !== "" ? String(entry.value) : undefined;
        }
        if (field === "icon") {
          item.icon = typeof entry?.icon === "string" && ALLOWED_ICONS.has(entry.icon) ? entry.icon : undefined;
        }
        out.push(item);
      }
      return out;
    }
   const data: Record<string, any> = {};
   for (const field of allowedFields) {
     if (payload[field] !== undefined) {
       if (field === "landingStatTitles") {
         const sanitized = sanitizeStatArray("title", payload[field]);
         if (sanitized === null) continue;
         if (sanitized.length === 0) {
           return sendError(res, 400, "landingStatTitles must contain at least one valid card id");
         }
         data[field] = sanitized;
       } else if (field === "landingStatDescriptions") {
         const sanitized = sanitizeStatArray("description", payload[field]);
         if (sanitized === null) continue;
         if (sanitized.length === 0) {
           return sendError(res, 400, "landingStatDescriptions must contain at least one valid card id");
         }
         data[field] = sanitized;
        } else if (field === "landingStatValues") {
          const sanitized = sanitizeStatArray("value", payload[field]);
          if (sanitized === null) continue;
          if (sanitized.length === 0) {
            return sendError(res, 400, "landingStatValues must contain at least one valid card id");
          }
          data[field] = sanitized;
        } else if (field === "landingStatIcons") {
          const sanitized = sanitizeStatArray("icon", payload[field]);
          if (sanitized === null) continue;
          if (sanitized.length === 0) {
            return sendError(res, 400, "landingStatIcons must contain at least one valid card id");
          }
          data[field] = sanitized;
        } else {
         data[field] = payload[field];
       }
     }
   }
    let control = await prismaClient.controlRoom.findFirst({ orderBy: { id: 'asc' } });
    if (!control) {
      control = await prismaClient.controlRoom.create({
        data: { ...data, humanChatEnabled: data.humanChatEnabled ?? true },
      });
    } else {
      control = await prismaClient.controlRoom.update({
        where: { id: control.id },
        data,
      });
    }

    return sendSuccess(res, control as unknown as JSONValue, "Control room updated");
  } catch (error) {
    console.error("Error updating control room:", error);
    return sendError(res, 500, "Failed to update control room");
  }
};
