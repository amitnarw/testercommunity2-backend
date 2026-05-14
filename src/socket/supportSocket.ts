import type { Namespace, Socket } from "socket.io";
import { prismaClient } from "../lib/prisma";
import { websocketAuthMiddleware } from "../middlewares/websocketAuth";
import logger from "../utils/logger";

const SUPPORT_ROLES = ["support", "admin", "super_admin"];

export function setupSupportSocket(namespace: Namespace) {
  namespace.use(websocketAuthMiddleware);

  namespace.on("connection", async (socket: Socket) => {
    const { userId, role, userName, userEmail } = socket.data;
    const isAgent = SUPPORT_ROLES.includes(role);
    logger.info(`Socket connected: ${userName} (${role})`);

    // -- User Events --
    socket.on("user:request_human", async (payload: { aiChatRequestId?: number }) => {
      logger.info(`[user:request_human] ${userName} requested human chat`);
      try {
        const { aiChatRequestId } = payload || {};

        const control = await prismaClient.controlRoom.findFirst();
        if (control && !control.humanChatEnabled) {
          logger.warn(`[user:request_human] Human chat disabled for ${userName}`);
          socket.emit("chat:unavailable", { reason: "Human chat is currently disabled." });
          return;
        }

        const existingActive = await prismaClient.supportRequest.findFirst({
          where: {
            userId,
            type: "HUMAN_CHAT",
            status: { in: ["PENDING", "IN_PROGRESS"] },
          },
        });

        if (existingActive) {
          logger.info(`[user:request_human] Found existing chat ${existingActive.id} (${existingActive.status}) for ${userName}`);
          socket.join(`support:${existingActive.id}`);
          const assignedAgent = existingActive.assignedTo
            ? await prismaClient.user.findUnique({
                where: { id: existingActive.assignedTo },
                select: { name: true },
              })
            : null;

          if (existingActive.status === "IN_PROGRESS") {
            socket.emit("chat:assigned", {
              chatId: existingActive.id,
              agentName: assignedAgent?.name || "Support Agent",
            });
            const existingMessages = await prismaClient.supportMessage.findMany({
              where: { supportRequestId: existingActive.id },
              orderBy: { createdAt: "asc" },
              take: 50,
            });
            logger.info(`[user:request_human] Sending ${existingMessages.length} history messages to ${userName}`);
            for (const msg of existingMessages) {
              socket.emit("chat:message", {
                chatId: existingActive.id,
                id: msg.id,
                senderType: msg.senderType,
                senderName:
                  msg.senderType === "USER"
                    ? userName
                    : msg.senderType === "AGENT"
                      ? assignedAgent?.name || "Support Agent"
                      : "System",
                message: msg.message,
                createdAt: msg.createdAt.toISOString(),
              });
            }
          } else {
            const position = await getQueuePosition(existingActive.id);
            socket.emit("chat:requested", {
              chatId: existingActive.id,
              position,
            });
            logger.info(`[user:request_human] User ${userName} re-joined queue at position ${position}`);
          }
          return;
        }

        const chat = await prismaClient.supportRequest.create({
          data: {
            userId,
            subject: "Live Chat Request",
            description: "User requested human support",
            type: "HUMAN_CHAT",
            status: "PENDING",
            category: "GENERAL",
          },
        });
        logger.info(`[user:request_human] Created new chat ${chat.id} for ${userName}`);

        if (aiChatRequestId) {
          logger.info(`[user:request_human] Transferring AI context from chat ${aiChatRequestId}`);
          const aiMessages = await prismaClient.supportMessage.findMany({
            where: { supportRequestId: aiChatRequestId },
            take: 10,
            orderBy: { createdAt: "asc" },
          });

          await prismaClient.supportMessage.create({
            data: {
              supportRequestId: chat.id,
              senderId: userId,
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

        socket.join(`support:${chat.id}`);

        const position = await getQueuePosition(chat.id);
        socket.emit("chat:requested", { chatId: chat.id, position });
        logger.info(`[user:request_human] User ${userName} joined room support:${chat.id}`);

        namespace.to("agent").emit("agent:queue_updated");
      } catch (error) {
        logger.error("[user:request_human] Error:", error);
        socket.emit("chat:error", { message: "Failed to request human chat" });
      }
    });

    socket.on("chat:send_message", async (payload: { chatId: number; message: string }) => {
      try {
        const { chatId, message } = payload;
        if (!message?.trim()) return;
        logger.info(`[chat:send_message] ${userName} sent message to chat ${chatId}`);

        const chat = await prismaClient.supportRequest.findUnique({
          where: { id: chatId },
        });

        if (!chat || chat.userId !== userId) {
          logger.warn(`[chat:send_message] Chat ${chatId} not found for user ${userId}`);
          socket.emit("chat:error", { message: "Chat not found" });
          return;
        }

        const saved = await prismaClient.supportMessage.create({
          data: {
            supportRequestId: chatId,
            senderId: userId,
            senderType: "USER",
            message,
          },
        });

        await prismaClient.supportRequest.update({
          where: { id: chatId },
          data: { updatedAt: new Date() },
        });

        logger.info(`[chat:send_message] Broadcasting message ${saved.id} to support:${chatId}`);
        namespace.to(`support:${chatId}`).emit("chat:message", {
          chatId,
          id: saved.id,
          senderType: "USER",
          senderName: userName,
          message: saved.message,
          createdAt: saved.createdAt.toISOString(),
        });
      } catch (error) {
        logger.error("[chat:send_message] Error:", error);
      }
    });

    socket.on("chat:typing", (payload: { chatId: number }) => {
      const { chatId } = payload;
      logger.debug(`[chat:typing] ${userName} typing in chat ${chatId}`);
      socket.broadcast.to(`support:${chatId}`).emit("chat:typing", { chatId });
    });

    socket.on("agent:typing", (payload: { chatId: number }) => {
      const { chatId } = payload;
      logger.debug(`[agent:typing] ${userName} typing in chat ${chatId}`);
      socket.broadcast.to(`support:${chatId}`).emit("agent:typing", { chatId });
    });

    socket.on("chat:close", async (payload: { chatId: number }) => {
      try {
        const { chatId } = payload;
        const chat = await prismaClient.supportRequest.findUnique({
          where: { id: chatId },
        });
        if (!chat || (chat.userId !== userId && !isAgent)) return;

        await prismaClient.supportRequest.update({
          where: { id: chatId },
          data: { status: "CLOSED" },
        });

        namespace.to(`support:${chatId}`).emit("chat:closed", {
          chatId,
          reason: chat.assignedTo ? "Resolved" : "Closed by user",
        });
        namespace.to("agent").emit("agent:queue_updated");
      } catch (error) {
        logger.error("Error closing chat:", error);
      }
    });

    // -- Agent Events --
    socket.on("agent:online", async () => {
      if (!isAgent) return;
      await initAgentState(socket, userId, userName);
    });

    socket.on("agent:take_chat", async (payload: { chatId: number }) => {
      if (!isAgent) return;
      const { chatId } = payload;

      try {
        const chat = await prismaClient.supportRequest.findUnique({
          where: { id: chatId },
          include: { user: { select: { id: true, name: true } } },
        });

        if (!chat || chat.status !== "PENDING") {
          socket.emit("agent:error", { message: "Chat is no longer available" });
          return;
        }

        await prismaClient.supportRequest.update({
          where: { id: chatId },
          data: { assignedTo: userId, status: "IN_PROGRESS", assignedAt: new Date() },
        });

        socket.join(`support:${chatId}`);

        const existingMessages = await prismaClient.supportMessage.findMany({
          where: { supportRequestId: chatId },
          orderBy: { createdAt: "asc" },
        });

        socket.emit("agent:chat_taken", { chatId });

        namespace.to(`support:${chatId}`).emit("chat:assigned", {
          chatId,
          agentName: userName,
        });

        namespace.to("agent").emit("agent:queue_updated");
      } catch (error) {
        logger.error("Error taking chat:", error);
      }
    });

    socket.on("agent:send_message", async (payload: { chatId: number; message: string }) => {
      if (!isAgent) return;
      const { chatId, message } = payload;
      if (!message?.trim()) return;

      try {
        const chat = await prismaClient.supportRequest.findUnique({
          where: { id: chatId },
        });
        if (!chat || chat.assignedTo !== userId) return;

        const saved = await prismaClient.supportMessage.create({
          data: {
            supportRequestId: chatId,
            senderId: userId,
            senderType: "AGENT",
            message,
          },
        });

        await prismaClient.supportRequest.update({
          where: { id: chatId },
          data: { updatedAt: new Date() },
        });

        namespace.to(`support:${chatId}`).emit("chat:message", {
          chatId,
          id: saved.id,
          senderType: "AGENT",
          senderName: userName,
          message: saved.message,
          createdAt: saved.createdAt.toISOString(),
        });
      } catch (error) {
        logger.error("Error sending agent message:", error);
      }
    });

    socket.on("agent:close_chat", async (payload: { chatId: number }) => {
      if (!isAgent) return;
      const { chatId } = payload;

      try {
        const chat = await prismaClient.supportRequest.findUnique({
          where: { id: chatId },
        });
        if (!chat || chat.assignedTo !== userId) return;

        await prismaClient.supportRequest.update({
          where: { id: chatId },
          data: { status: "RESOLVED" },
        });

        namespace.to(`support:${chatId}`).emit("chat:closed", {
          chatId,
          reason: "Resolved by support agent",
        });
        namespace.to("agent").emit("agent:queue_updated");
      } catch (error) {
        logger.error("Error closing chat:", error);
      }
    });

    socket.on("agent:offline", () => {
      if (!isAgent) return;
      socket.leave("agent");
    });

    // -- Join user room + auto-init state --
    socket.join(`user:${userId}`);

    try {
      if (isAgent) {
        await initAgentState(socket, userId, userName);
      } else {
        await initUserChatState(socket, userId, userName);
      }
    } catch (error) {
      logger.error("Error auto-initializing chat state:", error);
    }

    // Explicit rejoin request from client (e.g. after reconnection / page refresh)
    socket.on("user:rejoin", async () => {
      logger.info(`[user:rejoin] ${userName} requested rejoin`);
      try {
        await initUserChatState(socket, userId, userName);
        logger.info(`[user:rejoin] ${userName} rejoin complete`);
      } catch (error) {
        logger.error("[user:rejoin] Error:", error);
        socket.emit("chat:error", { message: "Failed to restore chat state" });
      }
    });

    socket.on("disconnect", () => {
      logger.info(`Socket disconnected: ${userName}`);
    });
  });
}

async function initUserChatState(socket: Socket, userId: string, userName: string) {
  const activeChats = await prismaClient.supportRequest.findMany({
    where: {
      userId,
      type: "HUMAN_CHAT",
      status: { in: ["PENDING", "IN_PROGRESS"] },
    },
    select: { id: true, status: true, assignedTo: true },
  });

  logger.info(`[initUserChatState] ${userName}: found ${activeChats.length} active chat(s)`);

  for (const chat of activeChats) {
    socket.join(`support:${chat.id}`);
    logger.info(`[initUserChatState] ${userName} joined room support:${chat.id}`);
  }

  if (activeChats.length === 0) return;

  const chat = activeChats[0];
  logger.info(`[initUserChatState] Restoring state for chat ${chat.id} (${chat.status})`);

  if (chat.status === "PENDING") {
    const position = await getQueuePosition(chat.id);
    socket.emit("chat:requested", { chatId: chat.id, position });
    logger.info(`[initUserChatState] Emitted chat:requested for chat ${chat.id}, position ${position}`);
  } else if (chat.status === "IN_PROGRESS") {
    const agentUser = chat.assignedTo
      ? await prismaClient.user.findUnique({
          where: { id: chat.assignedTo },
          select: { name: true },
        })
      : null;

    socket.emit("chat:assigned", {
      chatId: chat.id,
      agentName: agentUser?.name || "Support Agent",
    });
    logger.info(`[initUserChatState] Emitted chat:assigned for chat ${chat.id}, agent: ${agentUser?.name || "Support Agent"}`);

    const recentMessages = await prismaClient.supportMessage.findMany({
      where: { supportRequestId: chat.id },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    logger.info(`[initUserChatState] Sending ${recentMessages.length} history message(s) to ${userName}`);

    for (const msg of recentMessages) {
      socket.emit("chat:message", {
        chatId: chat.id,
        id: msg.id,
        senderType: msg.senderType,
        senderName:
          msg.senderType === "USER"
            ? userName
            : msg.senderType === "AGENT"
              ? agentUser?.name || "Support Agent"
              : "System",
        message: msg.message,
        createdAt: msg.createdAt.toISOString(),
      });
    }
  }
}

async function initAgentState(socket: Socket, userId: string, userName: string) {
  socket.join("agent");

  const pendingChats = await prismaClient.supportRequest.findMany({
    where: { type: "HUMAN_CHAT", status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      messages: { where: { isAi: true }, take: 5, orderBy: { createdAt: "asc" } },
    },
  });

  socket.emit(
    "agent:queue",
    pendingChats.map((c) => ({
      id: c.id,
      userId: c.userId,
      userName: c.user?.name || "Unknown",
      userEmail: c.user?.email || "",
      userImage: c.user?.image || null,
      createdAt: c.createdAt.toISOString(),
      isEscalated: c.isEscalated,
      aiContext: c.messages.map((m) => m.message).join("\n"),
    }))
  );

  const activeChats = await prismaClient.supportRequest.findMany({
    where: { type: "HUMAN_CHAT", assignedTo: userId, status: "IN_PROGRESS" },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  for (const chat of activeChats) {
    socket.join(`support:${chat.id}`);
  }

  socket.emit(
    "agent:active_chats",
    activeChats.map((c) => ({
      id: c.id,
      userId: c.userId,
      userName: c.user?.name || "Unknown",
      userEmail: c.user?.email || "",
      userImage: c.user?.image || null,
      messages: c.messages.map((m) => ({
        id: m.id,
        senderType: m.senderType,
        senderName: m.senderType === "USER" ? c.user?.name || "User" : userName,
        message: m.message,
        isAi: m.isAi,
        createdAt: m.createdAt.toISOString(),
      })),
      createdAt: c.createdAt.toISOString(),
    }))
  );
}

async function getQueuePosition(chatId: number): Promise<number> {
  const chats = await prismaClient.supportRequest.findMany({
    where: { type: "HUMAN_CHAT", status: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const index = chats.findIndex((c) => c.id === chatId);
  return index >= 0 ? index + 1 : chats.length;
}
