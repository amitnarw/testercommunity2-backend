import { type Request, type Response } from "express";
import { prismaClient } from "@/lib/prisma";
import { sendError, sendSuccess } from "@/utils/response";

export const createTicket = async (req: Request, res: Response) => {
  try {
    const { subject, description, category } = req.body.payload || req.body;

    if (!subject || !description) {
      return sendError(res, 400, "Subject and description are required");
    }

    const ticket = await prismaClient.conversation.create({
      data: {
        type: "TICKET",
        status: "OPEN",
        category: category || "GENERAL",
        subject,
        description,
        userId: req.userId || null,
      },
    });

    return sendSuccess(res, ticket as any, "Ticket created successfully");
  } catch (error) {
    console.error("Error creating ticket:", error);
    return sendError(res, 500, "Failed to create ticket");
  }
};

export const getTickets = async (req: Request, res: Response) => {
  try {
    const tickets = await prismaClient.conversation.findMany({
      where: {
        userId: req.userId,
        type: "TICKET",
      },
      orderBy: { createdAt: "desc" },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        assignedAgent: { select: { id: true, name: true, image: true } },
      },
    });

    return sendSuccess(res, tickets as any, "Tickets fetched successfully");
  } catch (error) {
    console.error("Error fetching tickets:", error);
    return sendError(res, 500, "Failed to fetch tickets");
  }
};

export const getChatHistory = async (req: Request, res: Response) => {
  try {
    const chat = await prismaClient.conversation.findFirst({
      where: {
        userId: req.userId,
        type: "AI_CHAT",
        status: { not: "CLOSED" },
      },
      orderBy: { updatedAt: "desc" },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
      },
    });

    return sendSuccess(res, chat?.messages as any || [], "Chat history fetched successfully");
  } catch (error) {
    console.error("Error fetching chat history:", error);
    return sendError(res, 500, "Failed to fetch chat history");
  }
};

export const saveChatMessage = async (req: Request, res: Response) => {
  try {
    const { message, role, conversationId } = req.body.payload || req.body;

    if (!message || !role) {
      return sendError(res, 400, "Message and role are required");
    }

    let conversation: { id: number } | null = null;

    if (conversationId) {
      conversation = await prismaClient.conversation.findFirst({
        where: { id: Number(conversationId), userId: req.userId },
      });
    }

    if (!conversation) {
      conversation = await prismaClient.conversation.findFirst({
        where: {
          userId: req.userId,
          type: "AI_CHAT",
          status: { not: "CLOSED" },
        },
        orderBy: { updatedAt: "desc" },
      });
    }

    if (!conversation) {
      conversation = await prismaClient.conversation.create({
        data: {
          type: "AI_CHAT",
          status: "OPEN",
          userId: req.userId || null,
          subject: "AI Support Chat",
          description: "Active chat session with Alex",
        },
      });
    }

    const savedMessage = await prismaClient.message.create({
      data: {
        conversationId: conversation.id,
        senderId: req.userId || null,
        senderType: role === "user" ? "USER" : "AI",
        messageType: "TEXT",
        content: message,
        isAi: role !== "user",
      },
    });

    await prismaClient.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    return sendSuccess(res, { ...savedMessage, conversationId: conversation.id } as any, "Message saved successfully");
  } catch (error) {
    console.error("Error saving message:", error);
    return sendError(res, 500, "Failed to save message");
  }
};

export const getTicketById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const ticket = await prismaClient.conversation.findFirst({
      where: {
        id: Number(id),
        userId: req.userId,
        type: "TICKET",
      },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        assignedAgent: { select: { id: true, name: true, image: true } },
      },
    });

    if (!ticket) {
      return sendError(res, 404, "Ticket not found");
    }

    return sendSuccess(res, ticket as any, "Ticket fetched successfully");
  } catch (error) {
    console.error("Error fetching ticket:", error);
    return sendError(res, 500, "Failed to fetch ticket");
  }
};

export const updateTicketStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body.payload || req.body;

    if (!status || !["OPEN", "RESOLVED", "CLOSED"].includes(status)) {
      return sendError(res, 400, "Valid status is required (OPEN, RESOLVED, CLOSED)");
    }

    const ticket = await prismaClient.conversation.findFirst({
      where: { id: Number(id), userId: req.userId, type: "TICKET" },
    });

    if (!ticket) {
      return sendError(res, 404, "Ticket not found");
    }

    const updateData: any = { status };
    if (status === "RESOLVED") updateData.resolvedAt = new Date();

    const updated = await prismaClient.conversation.update({
      where: { id: Number(id) },
      data: updateData,
    });

    return sendSuccess(res, updated as any, `Ticket marked as ${status.toLowerCase()} successfully`);
  } catch (error) {
    console.error("Error updating ticket status:", error);
    return sendError(res, 500, "Failed to update ticket status");
  }
};

export const requestHumanChat = async (req: Request, res: Response) => {
  try {
    const { aiChatRequestId, conversationId } = req.body.payload || req.body;

    const control = await prismaClient.controlRoom.findFirst();
    if (control && !control.humanChatEnabled) {
      return sendError(res, 403, "Human chat is currently disabled");
    }

    const existingActive = await prismaClient.conversation.findFirst({
      where: {
        userId: req.userId,
        type: "LIVE_CHAT",
        status: { in: ["WAITING_AGENT", "IN_PROGRESS"] },
      },
      include: {
        assignedAgent: { select: { id: true, name: true, image: true } },
        messages: { orderBy: { createdAt: "asc" }, take: 50 },
      },
    });

    if (existingActive) {
      return sendSuccess(res, existingActive as any, "Active chat already exists");
    }

    const chat = await prismaClient.conversation.create({
      data: {
        type: "LIVE_CHAT",
        status: "WAITING_AGENT",
        category: "GENERAL",
        subject: "Live Chat Request",
        description: "User requested human support",
        userId: req.userId,
      },
    });

    const escalationSourceId = conversationId || aiChatRequestId;

    if (escalationSourceId) {
      const aiMessages = await prismaClient.message.findMany({
        where: { conversationId: Number(escalationSourceId) },
        take: 10,
        orderBy: { createdAt: "asc" },
      });

      if (aiMessages.length > 0) {
        await prismaClient.message.create({
          data: {
            conversationId: chat.id,
            senderId: req.userId,
            senderType: "SYSTEM",
            messageType: "TRANSFER_NOTICE",
            content: `[AI Context: Previous conversation transferred from Alex]\n\n${aiMessages.map((m) => `${m.senderType === "USER" ? "User" : "AI Alex"}: ${m.content}`).join("\n\n")}`,
            isAi: true,
          },
        });

        await prismaClient.conversation.update({
          where: { id: chat.id },
          data: { isEscalated: true },
        });
      }
    }

    return sendSuccess(res, chat as any, "Human chat requested");
  } catch (error) {
    console.error("Error requesting human chat:", error);
    return sendError(res, 500, "Failed to request human chat");
  }
};

export const getActiveHumanChat = async (req: Request, res: Response) => {
  try {
    const chat = await prismaClient.conversation.findFirst({
      where: {
        userId: req.userId,
        type: "LIVE_CHAT",
        status: { in: ["WAITING_AGENT", "IN_PROGRESS"] },
      },
      include: {
        messages: { orderBy: { createdAt: "asc" }, take: 50 },
        assignedAgent: { select: { id: true, name: true, image: true } },
      },
    });

    return sendSuccess(res, chat as any, "Active chat fetched");
  } catch (error) {
    console.error("Error fetching active chat:", error);
    return sendError(res, 500, "Failed to fetch active chat");
  }
};

export const sendHumanMessage = async (req: Request, res: Response) => {
  try {
    const { chatId, message } = req.body.payload || req.body;
    if (!chatId || !message?.trim()) {
      return sendError(res, 400, "Chat ID and message are required");
    }

    const chat = await prismaClient.conversation.findUnique({
      where: { id: Number(chatId) },
    });

    if (!chat || chat.userId !== req.userId) {
      return sendError(res, 404, "Chat not found");
    }

    const saved = await prismaClient.message.create({
      data: {
        conversationId: Number(chatId),
        senderId: req.userId,
        senderType: "USER",
        messageType: "TEXT",
        content: message,
      },
    });

    await prismaClient.conversation.update({
      where: { id: Number(chatId) },
      data: { lastMessageAt: new Date() },
    });

    return sendSuccess(res, saved as any, "Message sent");
  } catch (error) {
    console.error("Error sending message:", error);
    return sendError(res, 500, "Failed to send message");
  }
};

export const getChatMessages = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const since = req.query.since ? new Date(req.query.since as string) : undefined;
    const adminRoles = ["support", "admin", "super_admin"];

    const chat = await prismaClient.conversation.findUnique({
      where: { id: Number(id) },
    });

    if (!chat) {
      return sendError(res, 404, "Chat not found");
    }

    if (chat.userId !== req.userId && !adminRoles.includes(req.role || "")) {
      return sendError(res, 404, "Chat not found");
    }

    const where: any = { conversationId: Number(id) };
    if (since) {
      where.createdAt = { gt: since };
    }

    const messages = await prismaClient.message.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });

    return sendSuccess(res, messages as any, "Messages fetched");
  } catch (error) {
    console.error("Error fetching messages:", error);
    return sendError(res, 500, "Failed to fetch messages");
  }
};

export const getAgentStatus = async (_req: Request, res: Response) => {
  try {
    const onlineAgents = await prismaClient.agentStatus.count({
      where: { status: "ONLINE" },
    });

    return sendSuccess(res, {
      online: onlineAgents > 0,
      onlineCount: onlineAgents,
    }, "Agent status fetched");
  } catch (error) {
    console.error("Error fetching agent status:", error);
    return sendError(res, 500, "Failed to fetch agent status");
  }
};
