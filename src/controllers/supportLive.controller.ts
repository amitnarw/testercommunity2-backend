import { type Request, type Response } from "express";
import { prismaClient } from "@/lib/prisma";
import { sendError, sendSuccess } from "@/utils/response";

export const requestHumanChat = async (req: Request, res: Response) => {
  try {
    const { aiChatRequestId } = req.body.payload || req.body;

    const control = await prismaClient.controlRoom.findFirst();
    if (control && !control.humanChatEnabled) {
      return sendError(res, 403, "Human chat is currently disabled");
    }

    const existingActive = await prismaClient.supportRequest.findFirst({
      where: {
        userId: req.userId,
        type: "HUMAN_CHAT",
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
    });

    if (existingActive) {
      return sendSuccess(res, existingActive, "Active chat already exists");
    }

    const chat = await prismaClient.supportRequest.create({
      data: {
        userId: req.userId,
        subject: "Live Chat Request",
        description: "User requested human support",
        type: "HUMAN_CHAT",
        status: "PENDING",
        category: "GENERAL",
      },
    });

    if (aiChatRequestId) {
      const aiMessages = await prismaClient.supportMessage.findMany({
        where: { supportRequestId: aiChatRequestId },
        take: 10,
        orderBy: { createdAt: "asc" },
      });

      if (aiMessages.length > 0) {
        await prismaClient.supportMessage.create({
          data: {
            supportRequestId: chat.id,
            senderId: req.userId,
            senderType: "AGENT",
            message: `[AI Context: Previous conversation transferred from Alex]\n\n${aiMessages.map((m) => `${m.senderType === "USER" ? "User" : "AI Alex"}: ${m.message}`).join("\n\n")}`,
            isAi: true,
          },
        });

        await prismaClient.supportRequest.update({
          where: { id: chat.id },
          data: { isEscalated: true },
        });
      }
    }

    return sendSuccess(res, chat, "Human chat requested");
  } catch (error) {
    console.error("Error requesting human chat:", error);
    return sendError(res, 500, "Failed to request human chat");
  }
};

export const getActiveHumanChat = async (req: Request, res: Response) => {
  try {
    const chat = await prismaClient.supportRequest.findFirst({
      where: {
        userId: req.userId,
        type: "HUMAN_CHAT",
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          take: 50,
        },
        assignedUser: {
          select: { id: true, name: true, image: true },
        },
      },
    });

    return sendSuccess(res, chat, "Active chat fetched");
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

    const chat = await prismaClient.supportRequest.findUnique({
      where: { id: Number(chatId) },
    });

    if (!chat || chat.userId !== req.userId) {
      return sendError(res, 404, "Chat not found");
    }

    const saved = await prismaClient.supportMessage.create({
      data: {
        supportRequestId: Number(chatId),
        senderId: req.userId,
        senderType: "USER",
        message,
      },
    });

    await prismaClient.supportRequest.update({
      where: { id: Number(chatId) },
      data: { updatedAt: new Date() },
    });

    return sendSuccess(res, saved, "Message sent");
  } catch (error) {
    console.error("Error sending message:", error);
    return sendError(res, 500, "Failed to send message");
  }
};

export const getChatMessages = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const since = req.query.since ? new Date(req.query.since as string) : undefined;

    const chat = await prismaClient.supportRequest.findUnique({
      where: { id: Number(id) },
    });

    if (!chat || chat.userId !== req.userId) {
      if (!req.role || !["support", "admin", "super_admin"].includes(req.role)) {
        return sendError(res, 404, "Chat not found");
      }
    }

    const where: any = { supportRequestId: Number(id) };
    if (since) {
      where.createdAt = { gt: since };
    }

    const messages = await prismaClient.supportMessage.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });

    return sendSuccess(res, messages, "Messages fetched");
  } catch (error) {
    console.error("Error fetching messages:", error);
    return sendError(res, 500, "Failed to fetch messages");
  }
};
