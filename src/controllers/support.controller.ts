import { type Request, type Response } from "express";
import { prismaClient } from "@/lib/prisma";
import { sendError, sendSuccess } from "@/utils/response";
import { streamText, convertToModelMessages, stepCountIs } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { buildAlexSystemPrompt, OPENROUTER_MODEL } from "@/lib/support-config";
import { z } from "zod";

const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY!,
});

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
        messages: {
          create: {
            senderId: req.userId || null,
            senderType: "USER",
            messageType: "TEXT",
            content: description,
          },
        },
      },
      include: {
        messages: true,
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

export const addTicketMessage = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { message } = req.body.payload || req.body;

    if (!message?.trim()) {
      return sendError(res, 400, "Message is required");
    }

    const ticket = await prismaClient.conversation.findFirst({
      where: {
        id: Number(id),
        userId: req.userId,
        type: "TICKET",
      },
    });

    if (!ticket) {
      return sendError(res, 404, "Ticket not found");
    }

    const saved = await prismaClient.message.create({
      data: {
        conversationId: Number(id),
        senderId: req.userId,
        senderType: "USER",
        messageType: "TEXT",
        content: message.trim(),
      },
    });

    const updateData: any = { lastMessageAt: new Date() };
    if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") {
      updateData.status = "OPEN";
      updateData.resolvedAt = null;
    }

    await prismaClient.conversation.update({
      where: { id: Number(id) },
      data: updateData,
    });

    return sendSuccess(res, saved as any, "Message sent");
  } catch (error) {
    console.error("Error adding ticket message:", error);
    return sendError(res, 500, "Failed to send message");
  }
};

export const requestHumanChat = async (req: Request, res: Response) => {
  try {
    const { aiChatRequestId, conversationId } = req.body.payload || req.body;

    const control = await prismaClient.controlRoom.findFirst({ orderBy: { id: 'asc' } });
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
        assignedAgent: { select: { id: true, name: true, image: true } },
      },
    });

    // Messages are ephemeral - they're delivered via Socket.IO
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

    // Messages are now ephemeral - handled via Socket.IO
    // Just update conversation lastMessageAt
    await prismaClient.conversation.update({
      where: { id: Number(chatId) },
      data: { lastMessageAt: new Date() },
    });

    return sendSuccess(res, { chatId, message }, "Message sent (ephemeral)");
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
    const staleThreshold = new Date(Date.now() - 60 * 1000);
    const onlineAgents = await prismaClient.agentStatus.count({
      where: {
        status: "ONLINE",
        lastSeenAt: { gte: staleThreshold },
      },
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

const ticketSchema = z.object({
  subject: z.string().describe("Short summary of the issue"),
  description: z.string().describe("Detailed explanation of the issue"),
  category: z.enum(["GENERAL", "TECHNICAL", "BILLING", "ACCOUNT", "BUG_REPORT", "OTHER"]).default("GENERAL"),
});

export const streamChat = async (req: Request, res: Response) => {
  try {
    const { messages } = req.body;
    const userId = req.userId;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Messages array is required" });
    }

    const MAX_HISTORY = 20;
    const trimmedMessages = messages.length > MAX_HISTORY
      ? messages.slice(-MAX_HISTORY)
      : messages;

    let modelMessages;
    try {
      modelMessages = await convertToModelMessages(trimmedMessages);
    } catch (convErr) {
      console.error("Failed to convert messages:", convErr);
      return res.status(400).json({ error: "Invalid message format" });
    }

    const controlRoom = await prismaClient.controlRoom.findFirst({ orderBy: { id: 'asc' } });

    const activePlans = await prismaClient.plans.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' },
    });

    let plansContext = "";
    if (activePlans.length > 0) {
      plansContext = activePlans
        .map((p) => {
          const features = Array.isArray(p.features) ? p.features.join(", ") : "";
          const cycleLabel = p.package === 1 ? "1 Pro testing cycle" : `${p.package} Pro testing cycles`;
          return `- ${p.name}: ₹${p.price} (${cycleLabel})${features ? ` — Features: ${features}` : ""}`;
        })
        .join("\n");
    }

    const systemPrompt = buildAlexSystemPrompt(controlRoom?.alexSystemPrompt, plansContext);

    const result = streamText({
      model: openrouter.chat(OPENROUTER_MODEL),
      system: systemPrompt,
      messages: modelMessages,
      tools: {
        create_ticket: {
          description: "Create a formal support ticket for complex issues or complaints",
          inputSchema: ticketSchema,
          execute: async (args: { subject: string; description: string; category: string }) => {
            try {
              const ticket = await prismaClient.conversation.create({
                data: {
                  type: "TICKET",
                  status: "OPEN",
                  category: (args.category || "GENERAL") as any,
                  subject: args.subject,
                  description: args.description,
                  userId: userId || null,
                },
              });

              // Save the AI conversation messages to the ticket
              const messagesToSave = trimmedMessages.filter(
                (m: any) => m.role === "user" || m.role === "assistant"
              );

              for (const msg of messagesToSave) {
                const textContent = msg.parts
                  ?.filter((p: any) => p.type === "text" && p.text)
                  .map((p: any) => p.text)
                  .join("\n") || msg.content || "";

                if (textContent) {
                  await prismaClient.message.create({
                    data: {
                      conversationId: ticket.id,
                      senderId: msg.role === "user" ? userId : null,
                      senderType: msg.role === "user" ? "USER" : "AI",
                      messageType: "TEXT",
                      content: textContent,
                      isAi: msg.role === "assistant",
                    },
                  });
                }
              }

              return {
                success: true,
                ticketId: ticket.id,
                message: `Ticket #${ticket.id} has been created with your conversation history.`,
              };
            } catch (err) {
              return { success: false, message: "Failed to create ticket." };
            }
          },
        },
        transfer_to_human: {
          description: "Transfer the user to a real human support agent when they request a real person or have a complex issue",
          inputSchema: z.object({
            reason: z.string().describe("Brief reason for the transfer"),
          }),
          execute: async (args: { reason: string }) => {
            try {
              const existingActive = await prismaClient.conversation.findFirst({
                where: {
                  userId: userId || null,
                  type: "LIVE_CHAT",
                  status: { in: ["WAITING_AGENT", "IN_PROGRESS"] },
                },
              });

              if (existingActive) {
                return { success: true, message: "You already have an active chat with support." };
              }

              const onlineAgentCount = await prismaClient.agentStatus.count({
                where: { status: "ONLINE" },
              });

              if (onlineAgentCount === 0) {
                return { success: false, message: "No agents are available right now, but I can help you. Would you like to continue chatting with me?" };
              }

              const chat = await prismaClient.conversation.create({
                data: {
                  type: "LIVE_CHAT",
                  status: "WAITING_AGENT",
                  category: "GENERAL",
                  subject: "Live Chat Request",
                  description: args.reason || "User requested human support via AI chat",
                  userId: userId || null,
                },
              });

              return { success: true, message: "A support agent will be with you shortly. Please hold on!", chatId: chat.id };
            } catch (err) {
              return { success: false, message: "No support agents are available right now. Please try again later or continue chatting with me." };
            }
          },
        },
      },
      stopWhen: stepCountIs(2),
      temperature: 0.5,
      maxOutputTokens: 1024,
    });

    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Cache-Control", "no-cache");
    result.pipeUIMessageStreamToResponse(res as any);
  } catch (error) {
    console.error("Support AI Chat Error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to process chat request" });
    }
  }
};
