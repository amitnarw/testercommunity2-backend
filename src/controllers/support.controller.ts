import { type Request, type Response } from "express";
import { prismaClient } from "@/lib/prisma";
import { sendError, sendSuccess } from "@/utils/response";
import type { AuditLogPayload } from "@/types/audit_log";

export const createTicket = async (req: Request, res: Response) => {
  try {
    const { subject, description, category } = req.body.payload || req.body;

    if (!subject || !description) {
      return sendError(res, 400, "Subject and description are required");
    }

    const ticket = await prismaClient.supportRequest.create({
      data: {
        userId: req.userId || null,
        subject,
        description,
        category: category || "GENERAL",
        status: "PENDING",
      },
    });

    return sendSuccess(res, ticket, "Ticket created successfully");
  } catch (error) {
    console.error("Error creating ticket:", error);
    return sendError(res, 500, "Failed to create ticket");
  }
};

export const getTickets = async (req: Request, res: Response) => {
  try {
    const tickets = await prismaClient.supportRequest.findMany({
      where: {
        userId: req.userId,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        messages: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    return sendSuccess(res, tickets, "Tickets fetched successfully");
  } catch (error) {
    console.error("Error fetching tickets:", error);
    return sendError(res, 500, "Failed to fetch tickets");
  }
};

export const getChatHistory = async (req: Request, res: Response) => {
  try {
    // We'll treat the most recent "GENERAL" support request as the "Chat" session
    const chat = await prismaClient.supportRequest.findFirst({
      where: {
        userId: req.userId,
        category: "GENERAL",
      },
      orderBy: {
        updatedAt: "desc",
      },
      include: {
        messages: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    return sendSuccess(res, chat?.messages || [], "Chat history fetched successfully");
  } catch (error) {
    console.error("Error fetching chat history:", error);
    return sendError(res, 500, "Failed to fetch chat history");
  }
};

export const saveChatMessage = async (req: Request, res: Response) => {
  try {
    const { message, role } = req.body.payload || req.body;

    if (!message || !role) {
      return sendError(res, 400, "Message and role are required");
    }

    // Find or create an active chat session
    let chat = await prismaClient.supportRequest.findFirst({
      where: {
        userId: req.userId,
        category: "GENERAL",
        status: { not: "CLOSED" },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    if (!chat) {
      chat = await prismaClient.supportRequest.create({
        data: {
          userId: req.userId || null,
          subject: "AI Support Chat",
          description: "Active chat session with Alex",
          type: "AI_CHAT",
          category: "GENERAL",
          status: "PENDING",
        },
      });
    }

    const savedMessage = await prismaClient.supportMessage.create({
      data: {
        supportRequestId: chat.id,
        senderId: req.userId || null,
        senderType: role === "user" ? "USER" : "AGENT",
        message,
        isAi: role !== "user",
      },
    });

    return sendSuccess(res, savedMessage, "Message saved successfully");
  } catch (error) {
    console.error("Error saving message:", error);
    return sendError(res, 500, "Failed to save message");
  }
};

export const getTicketById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const ticket = await prismaClient.supportRequest.findUnique({
      where: {
        id: Number(id),
        userId: req.userId,
      },
      include: {
        messages: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    if (!ticket) {
      return sendError(res, 404, "Ticket not found");
    }

    return sendSuccess(res, ticket, "Ticket fetched successfully");
  } catch (error) {
    console.error("Error fetching ticket:", error);
    return sendError(res, 500, "Failed to fetch ticket");
  }
};

export const updateTicketStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body.payload || req.body;

    if (!status) {
      return sendError(res, 400, "Status is required");
    }

    const ticket = await prismaClient.supportRequest.update({
      where: {
        id: Number(id),
        userId: req.userId,
      },
      data: {
        status,
      },
    });

    return sendSuccess(res, ticket, `Ticket marked as ${status.toLowerCase()} successfully`);
  } catch (error) {
    console.error("Error updating ticket status:", error);
    return sendError(res, 500, "Failed to update ticket status");
  }
};
