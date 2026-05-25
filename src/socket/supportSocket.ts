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
    socket.on("user:request_human", async (payload: { conversationId?: number; context?: { role: string; content: string }[] }) => {
      logger.info(`[user:request_human] ${userName} requested human chat`);
      try {
        const { conversationId, context } = payload || {};

        const control = await prismaClient.controlRoom.findFirst();
        if (control && !control.humanChatEnabled) {
          socket.emit("chat:unavailable", { reason: "Human chat is currently disabled." });
          return;
        }

        const existingActive = await prismaClient.conversation.findFirst({
          where: {
            userId,
            type: "LIVE_CHAT",
            status: { in: ["WAITING_AGENT", "IN_PROGRESS"] },
          },
        });

        if (existingActive) {
          socket.join(`conv:${existingActive.id}`);
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
            const existingMessages = await prismaClient.message.findMany({
              where: { conversationId: existingActive.id },
              orderBy: { createdAt: "asc" },
              take: 50,
            });
            for (const msg of existingMessages) {
              socket.emit("chat:message", {
                chatId: existingActive.id,
                id: msg.id,
                senderType: msg.senderType,
                senderName: resolveSenderName(msg, userName, assignedAgent?.name),
                message: msg.content,
                createdAt: msg.createdAt.toISOString(),
              });
            }
          } else {
            const position = await getQueuePosition(existingActive.id);
            socket.emit("chat:requested", { chatId: existingActive.id, position });
          }
          return;
        }

        const chat = await prismaClient.conversation.create({
          data: {
            userId,
            type: "LIVE_CHAT",
            status: "WAITING_AGENT",
            subject: "Live Chat Request",
            description: "User requested human support",
          },
        });

        if (conversationId) {
          const aiMessages = await prismaClient.message.findMany({
            where: { conversationId },
            take: 10,
            orderBy: { createdAt: "asc" },
          });

          if (aiMessages.length > 0) {
            await prismaClient.message.create({
              data: {
                conversationId: chat.id,
                senderId: userId,
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
        } else if (context && context.length > 0) {
          const formatted = context.map((m) => `${m.role === "user" ? "User" : "AI Alex"}: ${m.content}`).join("\n\n");
          await prismaClient.message.create({
            data: {
              conversationId: chat.id,
              senderId: userId,
              senderType: "SYSTEM",
              messageType: "TRANSFER_NOTICE",
              content: `[AI Context: Previous conversation transferred from Alex]\n\n${formatted}`,
              isAi: true,
            },
          });

          await prismaClient.conversation.update({
            where: { id: chat.id },
            data: { isEscalated: true },
          });
        }

        socket.join(`conv:${chat.id}`);

        // Check if any agents are online
        const onlineAgentCount = await prismaClient.agentStatus.count({
          where: { status: "ONLINE" },
        });

        if (onlineAgentCount === 0) {
          socket.emit("chat:fallback_to_ai", {
            message: "No agents are available right now, but Alex can help! A human agent will review your conversation when they come online.",
            chatId: chat.id,
          });
          logger.info(`[user:request_human] No agents online, falling back to AI for ${userName}`);
        } else {
          const position = await getQueuePosition(chat.id);
          socket.emit("chat:requested", { chatId: chat.id, position });
        }

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

        const chat = await prismaClient.conversation.findUnique({
          where: { id: chatId },
        });

        if (!chat || chat.userId !== userId) {
          socket.emit("chat:error", { message: "Chat not found" });
          return;
        }

        const saved = await prismaClient.message.create({
          data: {
            conversationId: chatId,
            senderId: userId,
            senderType: "USER",
            messageType: "TEXT",
            content: message,
          },
        });

        await prismaClient.conversation.update({
          where: { id: chatId },
          data: { lastMessageAt: new Date() },
        });

        namespace.to(`conv:${chatId}`).emit("chat:message", {
          chatId,
          id: saved.id,
          senderType: "USER",
          senderName: userName,
          message: saved.content,
          createdAt: saved.createdAt.toISOString(),
        });
      } catch (error) {
        logger.error("[chat:send_message] Error:", error);
      }
    });

    socket.on("chat:typing", (payload: { chatId: number }) => {
      socket.broadcast.to(`conv:${payload.chatId}`).emit("chat:typing", { chatId: payload.chatId });
    });

    socket.on("agent:typing", (payload: { chatId: number }) => {
      socket.broadcast.to(`conv:${payload.chatId}`).emit("agent:typing", { chatId: payload.chatId });
    });

    socket.on("chat:close", async (payload: { chatId: number }) => {
      try {
        const { chatId } = payload;
        const chat = await prismaClient.conversation.findUnique({
          where: { id: chatId },
        });
        if (!chat || (chat.userId !== userId && !isAgent)) return;

        await prismaClient.conversation.update({
          where: { id: chatId },
          data: { status: "CLOSED", resolvedAt: new Date() },
        });

        if (chat.assignedTo && chat.status === "IN_PROGRESS") {
          await prismaClient.agentStatus.update({
            where: { userId: chat.assignedTo },
            data: { currentChats: { decrement: 1 } },
          });
        }

        namespace.to(`conv:${chatId}`).emit("chat:closed", {
          chatId,
          reason: chat.assignedTo ? "Resolved" : "Closed by user",
        });
        namespace.to("agent").emit("agent:queue_updated");
        await broadcastQueuePositions(namespace);
      } catch (error) {
        logger.error("Error closing chat:", error);
      }
    });

    // -- Agent Events --
    socket.on("agent:online", async () => {
      if (!isAgent) return;
      await prismaClient.agentStatus.upsert({
        where: { userId },
        update: { status: "ONLINE", lastSeenAt: new Date() },
        create: { userId, status: "ONLINE" },
      });
      await initAgentState(socket, userId, userName);
      namespace.emit("agent:status_changed");
      socket.emit("agent:status", { online: true });
    });

    socket.on("agent:take_chat", async (payload: { chatId: number }) => {
      if (!isAgent) return;
      const { chatId } = payload;

      try {
        const agentStatus = await prismaClient.agentStatus.findUnique({
          where: { userId },
        });

        if (agentStatus && agentStatus.currentChats >= 1) {
          socket.emit("agent:error", { message: "You already have an active chat. Please close it first." });
          return;
        }

        const result = await prismaClient.conversation.updateMany({
          where: { id: chatId, status: "WAITING_AGENT" },
          data: {
            assignedTo: userId,
            status: "IN_PROGRESS",
            assignedAt: new Date(),
            firstResponseAt: new Date(),
          },
        });

        if (result.count === 0) {
          socket.emit("agent:error", { message: "Chat is no longer available" });
          return;
        }

        await prismaClient.agentStatus.upsert({
          where: { userId },
          update: { currentChats: { increment: 1 } },
          create: { userId, status: "ONLINE", currentChats: 1 },
        });

        socket.join(`conv:${chatId}`);

        const fullChat = await prismaClient.conversation.findUnique({
          where: { id: chatId },
          include: {
            user: { select: { id: true, name: true, email: true, image: true } },
            messages: { orderBy: { createdAt: "asc" } },
          },
        });

        if (fullChat) {
          socket.emit("agent:chat_taken", {
            chatId,
            chat: {
              id: fullChat.id,
              userId: fullChat.userId,
              userName: fullChat.user?.name || "Unknown",
              userEmail: fullChat.user?.email || "",
              userImage: fullChat.user?.image || null,
              messages: fullChat.messages.map((m) => ({
                id: m.id,
                senderType: m.senderType,
                senderName: m.senderType === "USER" ? fullChat.user?.name || "User" : userName,
                message: m.content,
                isAi: m.isAi,
                createdAt: m.createdAt.toISOString(),
              })),
              createdAt: fullChat.createdAt.toISOString(),
            },
          });
        } else {
          socket.emit("agent:chat_taken", { chatId });
        }

        namespace.to(`conv:${chatId}`).emit("chat:assigned", { chatId, agentName: userName });
        namespace.to("agent").emit("agent:queue_updated");
        await broadcastQueuePositions(namespace);
      } catch (error) {
        logger.error("Error taking chat:", error);
      }
    });

    socket.on("agent:send_message", async (payload: { chatId: number; message: string }) => {
      if (!isAgent) return;
      const { chatId, message } = payload;
      if (!message?.trim()) return;

      try {
        const chat = await prismaClient.conversation.findUnique({
          where: { id: chatId },
        });
        if (!chat || chat.assignedTo !== userId) return;

        const saved = await prismaClient.message.create({
          data: {
            conversationId: chatId,
            senderId: userId,
            senderType: "AGENT",
            messageType: "TEXT",
            content: message,
          },
        });

        await prismaClient.conversation.update({
          where: { id: chatId },
          data: { lastMessageAt: new Date() },
        });

        namespace.to(`conv:${chatId}`).emit("chat:message", {
          chatId,
          id: saved.id,
          senderType: "AGENT",
          senderName: userName,
          message: saved.content,
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
        const chat = await prismaClient.conversation.findUnique({
          where: { id: chatId },
        });
        if (!chat || chat.assignedTo !== userId) return;

        await prismaClient.conversation.update({
          where: { id: chatId },
          data: { status: "RESOLVED", resolvedAt: new Date() },
        });

        if (chat.assignedTo) {
          await prismaClient.agentStatus.update({
            where: { userId: chat.assignedTo },
            data: { currentChats: { decrement: 1 } },
          });
        }

        namespace.to(`conv:${chatId}`).emit("chat:closed", {
          chatId,
          reason: "Resolved by support agent",
        });
        namespace.to("agent").emit("agent:queue_updated");
        await broadcastQueuePositions(namespace);
      } catch (error) {
        logger.error("Error closing chat:", error);
      }
    });

    socket.on("agent:offline", () => {
      if (!isAgent) return;
      socket.leave("agent");
      prismaClient.agentStatus.upsert({
        where: { userId },
        update: { status: "OFFLINE" },
        create: { userId, status: "OFFLINE" },
      }).catch(() => {});
      namespace.emit("agent:status_changed");
      socket.emit("agent:status", { online: false });
    });

    socket.on("agent:heartbeat", async () => {
      if (!isAgent) return;
      await prismaClient.agentStatus.update({
        where: { userId },
        data: { lastSeenAt: new Date() },
      }).catch(() => {});
    });

    socket.on("agent:refresh_queue", async () => {
      if (!isAgent) return;
      await initAgentState(socket, userId, userName);
    });

    socket.on("agent:get_status", async () => {
      if (!isAgent) return;
      const status = await prismaClient.agentStatus.findUnique({
        where: { userId },
      }).catch(() => null);
      socket.emit("agent:status", {
        online: status?.status === "ONLINE",
      });
    });

    // -- Init state on connect --
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

    socket.on("user:rejoin", async () => {
      logger.info(`[user:rejoin] ${userName} requested rejoin`);
      try {
        await initUserChatState(socket, userId, userName);
      } catch (error) {
        logger.error("[user:rejoin] Error:", error);
        socket.emit("chat:error", { message: "Failed to restore chat state" });
      }
    });

    socket.on("disconnect", async () => {
      logger.info(`Socket disconnected: ${userName}`);

      if (isAgent) {
        // Don't set OFFLINE immediately — let the heartbeat/cleanup handle it.
        // This handles: network blips, multi-tab, page refresh gracefully.
        logger.info(`Agent socket disconnected: ${userName} (cleanup will handle status)`);
      } else {
        const activeChats = await prismaClient.conversation.findMany({
          where: {
            userId,
            type: "LIVE_CHAT",
            status: { in: ["WAITING_AGENT", "IN_PROGRESS"] },
          },
        }).catch(() => []);

        for (const chat of activeChats) {
          if (chat.status === "WAITING_AGENT") {
            await prismaClient.conversation.update({
              where: { id: chat.id },
              data: { status: "CLOSED", resolvedAt: new Date() },
            }).catch(() => {});
          } else if (chat.status === "IN_PROGRESS" && chat.assignedTo) {
            await prismaClient.conversation.update({
              where: { id: chat.id },
              data: { status: "RESOLVED", resolvedAt: new Date() },
            }).catch(() => {});

            await prismaClient.agentStatus.update({
              where: { userId: chat.assignedTo },
              data: { currentChats: { decrement: 1 } },
            }).catch(() => {});

            namespace.to(`conv:${chat.id}`).emit("chat:closed", {
              chatId: chat.id,
              reason: "User disconnected",
            });
          }
        }

        if (activeChats.some((c) => c.status === "WAITING_AGENT")) {
          namespace.to("agent").emit("agent:queue_updated");
        }
      }
    });
  });

  // Periodic cleanup: stale agents + stale queue (runs every 60 seconds)
  setInterval(async () => {
    try {
      // 1. Set stale agents to OFFLINE (no heartbeat for 1 minute)
      const staleThreshold = new Date(Date.now() - 60 * 1000);
      const staleAgents = await prismaClient.agentStatus.findMany({
        where: {
          status: "ONLINE",
          lastSeenAt: { lt: staleThreshold },
        },
      });

      for (const agent of staleAgents) {
        await prismaClient.agentStatus.update({
          where: { userId: agent.userId },
          data: { status: "OFFLINE" },
        });

        const activeChats = await prismaClient.conversation.findMany({
          where: { assignedTo: agent.userId, status: "IN_PROGRESS" },
        });

        for (const chat of activeChats) {
          await prismaClient.conversation.update({
            where: { id: chat.id },
            data: { status: "RESOLVED", resolvedAt: new Date() },
          });
          namespace.to(`conv:${chat.id}`).emit("chat:closed", {
            chatId: chat.id,
            reason: "Agent went offline",
          });
        }

        if (activeChats.length > 0) {
          await prismaClient.agentStatus.update({
            where: { userId: agent.userId },
            data: { currentChats: { decrement: activeChats.length } },
          });
        }
      }

      if (staleAgents.length > 0) {
        namespace.emit("agent:status_changed");
        namespace.to("agent").emit("agent:queue_updated");
      }

      // 2. Close stale WAITING_AGENT conversations (older than 10 minutes)
      const queueTimeout = new Date(Date.now() - 10 * 60 * 1000);
      const staleQueue = await prismaClient.conversation.updateMany({
        where: {
          type: "LIVE_CHAT",
          status: "WAITING_AGENT",
          createdAt: { lt: queueTimeout },
        },
        data: { status: "CLOSED", resolvedAt: new Date() },
      });

      if (staleQueue.count > 0) {
        namespace.to("agent").emit("agent:queue_updated");
      }
    } catch (error) {
      logger.error("Error in periodic cleanup:", error);
    }
  }, 60 * 1000);
}

async function initUserChatState(socket: Socket, userId: string, userName: string) {
  const activeChats = await prismaClient.conversation.findMany({
    where: {
      userId,
      type: "LIVE_CHAT",
      status: { in: ["WAITING_AGENT", "IN_PROGRESS"] },
    },
    select: { id: true, status: true, assignedTo: true },
  });

  for (const chat of activeChats) {
    socket.join(`conv:${chat.id}`);
  }

  if (activeChats.length === 0) return;

  const chat = activeChats[0];

  if (chat.status === "WAITING_AGENT") {
    const position = await getQueuePosition(chat.id);
    socket.emit("chat:requested", { chatId: chat.id, position });
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

    const recentMessages = await prismaClient.message.findMany({
      where: { conversationId: chat.id },
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    for (const msg of recentMessages) {
      socket.emit("chat:message", {
        chatId: chat.id,
        id: msg.id,
        senderType: msg.senderType,
        senderName: resolveSenderName(msg, userName, agentUser?.name),
        message: msg.content,
        createdAt: msg.createdAt.toISOString(),
      });
    }
  }
}

async function initAgentState(socket: Socket, userId: string, userName: string) {
  socket.join("agent");

  const waitingChats = await prismaClient.conversation.findMany({
    where: { type: "LIVE_CHAT", status: "WAITING_AGENT" },
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

  socket.emit(
    "agent:queue",
    waitingChats.map((c) => ({
      id: c.id,
      userId: c.userId,
      userName: c.user?.name || "Unknown",
      userEmail: c.user?.email || "",
      userImage: c.user?.image || null,
      createdAt: c.createdAt.toISOString(),
      isEscalated: c.isEscalated,
      aiContext: c.messages.map((m) => m.content).join("\n"),
    }))
  );

  const activeChats = await prismaClient.conversation.findMany({
    where: { type: "LIVE_CHAT", assignedTo: userId, status: "IN_PROGRESS" },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  for (const chat of activeChats) {
    socket.join(`conv:${chat.id}`);
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
        message: m.content,
        isAi: m.isAi,
        createdAt: m.createdAt.toISOString(),
      })),
      createdAt: c.createdAt.toISOString(),
    }))
  );

  const agentStatus = await prismaClient.agentStatus.findUnique({
    where: { userId },
  }).catch(() => null);
  socket.emit("agent:status", {
    online: agentStatus?.status === "ONLINE",
  });
}

async function getQueuePosition(conversationId: number): Promise<number> {
  const chats = await prismaClient.conversation.findMany({
    where: { type: "LIVE_CHAT", status: "WAITING_AGENT" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const index = chats.findIndex((c) => c.id === conversationId);
  return index >= 0 ? index + 1 : chats.length;
}

async function broadcastQueuePositions(namespace: Namespace) {
  const waitingChats = await prismaClient.conversation.findMany({
    where: { type: "LIVE_CHAT", status: "WAITING_AGENT" },
    orderBy: { createdAt: "asc" },
    select: { id: true, userId: true },
  });

  for (let i = 0; i < waitingChats.length; i++) {
    const chat = waitingChats[i];
    if (chat.userId) {
      namespace.to(`user:${chat.userId}`).emit("chat:position_updated", {
        chatId: chat.id,
        position: i + 1,
      });
    }
  }
}

function resolveSenderName(msg: { senderType: string; isAi: boolean }, userName: string, agentName?: string): string {
  if (msg.senderType === "USER") return userName;
  if (msg.senderType === "AGENT") return agentName || "Support Agent";
  if (msg.senderType === "AI") return "Alex";
  if (msg.senderType === "SYSTEM") return "System";
  return "Support Agent";
}
