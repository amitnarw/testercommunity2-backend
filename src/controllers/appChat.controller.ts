import { type Request, type Response } from "express";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient } from "@/lib/prisma";
import logger from "@/utils/logger";

export const getOrCreateAppChat = async (req: Request, res: Response) => {
  try {
    const { dashboardAndHubId } = req.body.payload || req.body;
    const userId = req.userId;

    if (!dashboardAndHubId || !userId) {
      return sendError(res, 400, "dashboardAndHubId and userId are required");
    }

    const dashboardAndHub = await prismaClient.dashboardAndHub.findUnique({
      where: { id: Number(dashboardAndHubId) },
      include: {
        androidApp: { select: { appName: true } },
      },
    });

    if (!dashboardAndHub) {
      return sendError(res, 404, "Dashboard and hub not found");
    }

    if (dashboardAndHub.appOwnerId !== userId && !req.isAdmin) {
      return sendError(res, 403, "You don\'t have permission to access this app");
    }

    let conversation = await prismaClient.conversation.findFirst({
      where: {
        dashboardAndHubId: Number(dashboardAndHubId),
        userId,
        type: "LIVE_CHAT",
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          take: 50,
        },
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    if (!conversation) {
      const appName = dashboardAndHub.androidApp?.appName || "Untitled App";
      conversation = await prismaClient.conversation.create({
        data: {
          userId,
          type: "LIVE_CHAT",
          status: "OPEN",
          subject: `App testing chat: ${appName}`,
          description: "Chat with Testing Manager for app testing assistance",
          dashboardAndHubId: Number(dashboardAndHubId),
          category: "TECHNICAL",
          priority: "MEDIUM",
        },
        include: {
          messages: { orderBy: { createdAt: "asc" }, take: 50 },
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      });
    }

    return sendSuccess(res, { conversation } as any, "App chat retrieved or created successfully");
  } catch (error) {
    logger.error("Error getting or creating app chat:", error);
    return sendError(res, 500, "Failed to get or create app chat");
  }
};

export const getUnreadCountAdmin = async (req: Request, res: Response) => {
  try {
    const { appId } = req.params;
    const userId = req.userId;

    if (!appId || !userId) {
      return sendError(res, 400, "App ID and user ID are required");
    }

    const conversation = await prismaClient.conversation.findFirst({
      where: {
        dashboardAndHubId: Number(appId),
        type: "LIVE_CHAT",
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!conversation) {
      return sendSuccess(res, { count: 0 }, "No conversation found");
    }

    const ownerId = conversation.userId;
    const readAt = conversation.agentLastReadAt;

    if (readAt) {
      const count = conversation.messages.filter(
        (m) => m.senderId === ownerId && new Date(m.createdAt) > new Date(readAt)
      ).length;
      return sendSuccess(res, { count }, "Unread count fetched successfully");
    } else {
      const count = conversation.messages.filter((m) => m.senderId === ownerId).length;
      return sendSuccess(res, { count }, "Unread count fetched successfully");
    }
  } catch (error) {
    logger.error("Error fetching unread count:", error);
    return sendError(res, 500, "Failed to fetch unread count");
  }
};

export const getUnreadCountUser = async (req: Request, res: Response) => {
  try {
    const { appId } = req.params;
    const userId = req.userId;

    if (!appId || !userId) {
      return sendError(res, 400, "App ID and user ID are required");
    }

    const dashboardAndHub = await prismaClient.dashboardAndHub.findUnique({
      where: { id: Number(appId) },
    });

    if (!dashboardAndHub) {
      return sendError(res, 404, "Dashboard and hub not found");
    }

    if (dashboardAndHub.appOwnerId !== userId && !req.isAdmin) {
      return sendError(res, 403, "You don't have permission to access this app");
    }

    const conversation = await prismaClient.conversation.findFirst({
      where: {
        dashboardAndHubId: Number(appId),
        type: "LIVE_CHAT",
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!conversation) {
      return sendSuccess(res, { count: 0 }, "No conversation found");
    }

    const ownerId = conversation.userId;
    const readAt = conversation.ownerLastReadAt;

    if (readAt) {
      const count = conversation.messages.filter(
        (m) => m.senderId !== ownerId && new Date(m.createdAt) > new Date(readAt)
      ).length;
      return sendSuccess(res, { count }, "Unread count fetched successfully");
    } else {
      const count = conversation.messages.filter((m) => m.senderId !== ownerId).length;
      return sendSuccess(res, { count }, "Unread count fetched successfully");
    }
  } catch (error) {
    logger.error("Error fetching user unread count:", error);
    return sendError(res, 500, "Failed to fetch user unread count");
  }
};

export const markAppChatRead = async (req: Request, res: Response) => {
  try {
    const { appId } = req.params;
    const userId = req.userId;

    if (!appId || !userId) {
      return sendError(res, 400, "App ID and user ID are required");
    }

    const dashboardAndHub = await prismaClient.dashboardAndHub.findUnique({
      where: { id: Number(appId) },
    });

    if (!dashboardAndHub) {
      return sendError(res, 404, "Dashboard and hub not found");
    }

    if (dashboardAndHub.appOwnerId !== userId && !req.isAdmin) {
      return sendError(res, 403, "You don't have permission to access this app");
    }

    const conversation = await prismaClient.conversation.findFirst({
      where: {
        dashboardAndHubId: Number(appId),
        type: "LIVE_CHAT",
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
    });

    if (!conversation) {
      return sendSuccess(res, { count: 0 }, "No conversation found");
    }

    const now = new Date();
    if (req.isAdmin) {
      await prismaClient.conversation.update({
        where: { id: conversation.id },
        data: { agentLastReadAt: now },
      });
    } else {
      await prismaClient.conversation.update({
        where: { id: conversation.id },
        data: { ownerLastReadAt: now },
      });
    }

    return sendSuccess(res, { count: 0 }, "Marked as read");
  } catch (error) {
    logger.error("Error marking app chat as read:", error);
    return sendError(res, 500, "Failed to mark app chat as read");
  }
};

export const getAppChatMessages = async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId;
    const userId = req.userId;

    if (!conversationId || !userId) {
      return sendError(res, 400, "Conversation ID and user ID are required");
    }

    const conversation = await prismaClient.conversation.findUnique({
      where: { id: Number(conversationId) },
    });

    if (!conversation) {
      return sendError(res, 404, "Conversation not found");
    }

    if (conversation.userId !== userId && !req.isAdmin) {
      return sendError(res, 403, "You don't have permission to access this conversation");
    }

    const before = req.query.before as string | undefined;
    const limit = req.query.limit as string | undefined;

    const whereClause: any = {
      conversationId: Number(conversationId),
    };

    if (before) {
      whereClause.createdAt = { lt: new Date(before) };
    }

    const messages = await prismaClient.message.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      take: limit ? Number(limit) : 50,
      include: {
        senderUser: { select: { id: true, name: true, image: true } },
      },
    });

    return sendSuccess(res, { messages: messages.reverse() } as any, "Messages fetched successfully");
  } catch (error) {
    logger.error("Error fetching app chat messages:", error);
    return sendError(res, 500, "Failed to fetch app chat messages");
  }
};

export const peekAppChat = async (req: Request, res: Response) => {
  try {
    const { appId } = req.params;
    const userId = req.userId;

    if (!appId || !userId) {
      return sendError(res, 400, "App ID and user ID are required");
    }

    const dashboardAndHub = await prismaClient.dashboardAndHub.findUnique({
      where: { id: Number(appId) },
    });

    if (!dashboardAndHub) {
      return sendError(res, 404, "Dashboard and hub not found");
    }

    if (dashboardAndHub.appOwnerId !== userId && !req.isAdmin) {
      return sendError(res, 403, "You don't have permission to access this app");
    }

    // Peek-only: does NOT create a conversation.
    const conversation = await prismaClient.conversation.findFirst({
      where: {
        dashboardAndHubId: Number(appId),
        type: "LIVE_CHAT",
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          take: 50,
        },
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    // Mark as read when the user opens the chat
    if (conversation) {
      const now = new Date();
      if (req.isAdmin) {
        await prismaClient.conversation.update({
          where: { id: conversation.id },
          data: { agentLastReadAt: now },
        });
      } else if (dashboardAndHub.appOwnerId === userId) {
        await prismaClient.conversation.update({
          where: { id: conversation.id },
          data: { ownerLastReadAt: now },
        });
      }
    }

    return sendSuccess(res, { conversation } as any, "App chat peeked successfully");
  } catch (error) {
    logger.error("Error peeking app chat:", error);
    return sendError(res, 500, "Failed to peek app chat");
  }
};

export const sendAppChatMessage = async (req: Request, res: Response) => {
  try {
    const { chatId, message } = req.body.payload || req.body;
    const userId = req.userId;

    if (!chatId || !message?.trim() || !userId) {
      return sendError(res, 400, "Chat ID, message, and user ID are required");
    }

    const conversation = await prismaClient.conversation.findUnique({
      where: { id: Number(chatId) },
    });
    if (!conversation) {
      return sendError(res, 404, "Conversation not found");
    }

    if (conversation.userId !== userId && !req.isAdmin) {
      return sendError(res, 403, "You don't have permission to send messages in this chat");
    }

    if (conversation.status === "RESOLVED" || conversation.status === "CLOSED") {
      return sendError(res, 400, "This conversation is closed");
    }

    const dashboardAndHub = conversation.dashboardAndHubId
      ? await prismaClient.dashboardAndHub.findUnique({
          where: { id: conversation.dashboardAndHubId },
        })
      : null;

    const isRejected = dashboardAndHub?.status === "REJECTED";

    const newMessage = await prismaClient.message.create({
      data: {
        conversationId: Number(chatId),
        senderId: userId,
        senderType: "USER",
        messageType: "TEXT",
        content: message,
        isAi: false,
      },
    });

    await prismaClient.conversation.update({
      where: { id: Number(chatId) },
      data: {
        lastMessageAt: new Date(),
        status: "IN_PROGRESS",
      },
    });

    if (!isRejected) {
      await prismaClient.userActivity.create({
        data: {
          userId: userId,
          actionType: "GIVE_FEEDBACK",
          description: message,
          status: "SUCCESS",
        },
      });

      if (dashboardAndHub) {
        await prismaClient.userActivity.create({
          data: {
            userId: dashboardAndHub.appOwnerId,
            dashboardAndHubId: dashboardAndHub.id,
            actionType: "GIVE_FEEDBACK",
            description: message,
            status: "SUCCESS",
          },
        });
      }
    }

    return sendSuccess(res, { message: newMessage } as any, "Message sent successfully");
  } catch (error) {
    logger.error("Error sending app chat message:", error);
    return sendError(res, 500, "Failed to send app chat message");
  }
};

export const getAppChatsAdmin = async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const whereClause: any = {};
    if (status && status !== "ALL") {
      if (status === "COMPLETED") {
        whereClause.status = "CLOSED";
      } else if (status === "DELETED") {
        whereClause.dashboardAndHubId = null;
      } else {
        whereClause.status = status;
      }
    }

    const [conversations, total] = await Promise.all([
      prismaClient.conversation.findMany({
        where: whereClause,
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
          appDashboardAndHub: {
            include: {
              androidApp: {
                select: {
                  appName: true,
                  appLogoUrl: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip,
      }),
      prismaClient.conversation.count({ where: whereClause }),
    ]);

    return sendSuccess(res, { conversations, total, page, limit } as any, "Admin app chats fetched successfully");
  } catch (error) {
    logger.error("Error fetching admin app chats:", error);
    return sendError(res, 500, "Failed to fetch admin app chats");
  }
};

export const deleteAppChatAdmin = async (req: Request, res: Response) => {
  try {
    const chatId = req.params.chatId;
    const userId = req.userId;

    if (!chatId || !userId) {
      return sendError(res, 400, "Chat ID and user ID are required");
    }

    if (!req.isAdmin) {
      return sendError(res, 403, "Only admins can delete app chats");
    }

    const conversation = await prismaClient.conversation.findUnique({
      where: { id: Number(chatId) },
      include: {
        appDashboardAndHub: true,
      },
    });

    if (!conversation) {
      return sendError(res, 404, "Conversation not found");
    }

    if (!conversation.dashboardAndHubId) {
      return sendError(res, 400, "This chat is not associated with any app");
    }

    const dashboardAndHub = await prismaClient.dashboardAndHub.findUnique({
      where: { id: conversation.dashboardAndHubId },
    });

    if (!dashboardAndHub) {
      return sendError(res, 404, "Associated app not found");
    }

    if (dashboardAndHub.status !== "COMPLETED") {
      return sendError(res, 400, "Can only delete chat after app testing is completed");
    }

    await prismaClient.conversation.delete({
      where: { id: Number(chatId) },
    });

    return sendSuccess(res, null, "App chat deleted successfully");
  } catch (error) {
    logger.error("Error deleting app chat:", error);
    return sendError(res, 500, "Failed to delete app chat");
  }
};

export const backfillAppChatsAdmin = async (req: Request, res: Response) => {
  try {
    const userId = req.userId;

    if (!userId || !req.isAdmin) {
      return sendError(res, 403, "Only admins can backfill app chats");
    }

    const paidApps = await prismaClient.dashboardAndHub.findMany({
      where: {
        appType: "PAID",
        status: "IN_TESTING",
      },
      include: {
        androidApp: { select: { appName: true } },
      },
    });

    const results: { appId: number; status: string; chatId?: number }[] = [];
    for (const app of paidApps) {
      const existing = await prismaClient.conversation.findFirst({
        where: {
          dashboardAndHubId: app.id,
          userId: app.appOwnerId,
          type: "LIVE_CHAT",
        },
      });

      if (existing) {
        results.push({ appId: app.id, status: "already_exists" });
        continue;
      }

      const appName = app.androidApp?.appName || "Untitled App";
      const conversation = await prismaClient.conversation.create({
        data: {
          userId: app.appOwnerId,
          type: "LIVE_CHAT",
          status: "OPEN",
          subject: `App testing chat: ${appName}`,
          description: "Auto-generated chat for paid app",
          dashboardAndHubId: app.id,
          category: "TECHNICAL",
          priority: "MEDIUM",
        },
      });

      results.push({ appId: app.id, status: "created", chatId: conversation.id });
    }

    return sendSuccess(res, { results } as any, "App chat backfill completed");
  } catch (error) {
    logger.error("Error backfilling app chats:", error);
    return sendError(res, 500, "Failed to backfill app chats");
  }
};
