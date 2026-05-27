import type { Namespace, Socket } from "socket.io";
import { prismaClient } from "../lib/prisma";
import { websocketAuthMiddleware } from "../middlewares/websocketAuth";
import logger from "../utils/logger";

const SUPPORT_ROLES = ["support", "admin", "super_admin"];

interface EphemeralMessage {
  senderId: string;
  senderType: string;
  content: string;
  isAi: boolean;
  createdAt: Date;
}

// In-memory storage for live chat messages (ephemeral - not persisted to DB)
const ephemeralMessages = new Map<number, EphemeralMessage[]>();
const MAX_EPHEMERAL_MESSAGES = 500;

// Incrementing counter for ephemeral message IDs (avoids Date.now() collisions)
let ephemeralMsgCounter = 0;
function nextEphemeralId(): number {
  return ++ephemeralMsgCounter;
}

// Grace period tracking for user disconnects (userId -> timer)
const disconnectTimers = new Map<string, NodeJS.Timeout>();
const DISCONNECT_GRACE_MS = 30_000; // 30 seconds

// Periodic cleanup interval reference (prevent accumulation on re-init)
let cleanupInterval: NodeJS.Timeout | null = null;

export function setupSupportSocket(namespace: Namespace) {
  namespace.use(websocketAuthMiddleware);

  namespace.on("connection", async (socket: Socket) => {
    const { userId, role, userName, userEmail } = socket.data;
    const isAgent = SUPPORT_ROLES.includes(role);
    logger.info(`Socket connected: ${userName} (${role})`);

    // -- User Events --
    socket.on("user:request_human", async (payload: { conversationId?: number; context?: { role: string; content: string }[] }) => {
      if (isAgent) {
        socket.emit("chat:unavailable", { reason: "Agents cannot request live chat support." });
        return;
      }
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
            // Get messages from ephemeral storage (in-memory)
            const existingMessages = ephemeralMessages.get(existingActive.id) || [];
            for (const msg of existingMessages) {
              socket.emit("chat:message", {
                chatId: existingActive.id,
                id: nextEphemeralId(), // Fix #4: Use incrementing counter
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
            const transferContent = `[AI Context: Previous conversation transferred from Alex]\n\n${aiMessages.map((m) => `${m.senderType === "USER" ? "User" : "AI Alex"}: ${m.content}`).join("\n\n")}`;

            await prismaClient.message.create({
              data: {
                conversationId: chat.id,
                senderId: userId,
                senderType: "SYSTEM",
                messageType: "TRANSFER_NOTICE",
                content: transferContent,
                isAi: true,
              },
            });

            // Also add to ephemeral Map so agents can see it
            ephemeralMessages.set(chat.id, [{
              senderId: userId,
              senderType: "SYSTEM",
              content: transferContent,
              isAi: true,
              createdAt: new Date(),
            }]);

            await prismaClient.conversation.update({
              where: { id: chat.id },
              data: { isEscalated: true },
            });
          }
        } else if (context && context.length > 0) {
          const formatted = context.map((m) => `${m.role === "user" ? "User" : "AI Alex"}: ${m.content}`).join("\n\n");
          const transferContent = `[AI Context: Previous conversation transferred from Alex]\n\n${formatted}`;

          await prismaClient.message.create({
            data: {
              conversationId: chat.id,
              senderId: userId,
              senderType: "SYSTEM",
              messageType: "TRANSFER_NOTICE",
              content: transferContent,
              isAi: true,
            },
          });

          // Also add to ephemeral Map so agents can see it
          ephemeralMessages.set(chat.id, [{
            senderId: userId,
            senderType: "SYSTEM",
            content: transferContent,
            isAi: true,
            createdAt: new Date(),
          }]);

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

        // Fix #5: Only allow messages in active chats
        if (!["WAITING_AGENT", "IN_PROGRESS"].includes(chat.status)) {
          socket.emit("chat:error", { message: "Chat is not active" });
          return;
        }

        // Store message in memory (ephemeral)
        const ephemeralMsg: EphemeralMessage = {
          senderId: userId,
          senderType: "USER",
          content: message,
          isAi: false,
          createdAt: new Date(),
        };

        const existing = ephemeralMessages.get(chatId) || [];
        existing.push(ephemeralMsg);
        // Fix #9: Cap messages per chat
        if (existing.length > MAX_EPHEMERAL_MESSAGES) {
          existing.splice(0, existing.length - MAX_EPHEMERAL_MESSAGES);
        }
        ephemeralMessages.set(chatId, existing);

        // Update conversation lastMessageAt
        await prismaClient.conversation.update({
          where: { id: chatId },
          data: { lastMessageAt: new Date() },
        });

        // Fix #4: Use incrementing counter instead of Date.now()
        const msgId = nextEphemeralId();
        namespace.to(`conv:${chatId}`).emit("chat:message", {
          chatId,
          id: msgId,
          senderType: "USER",
          senderName: userName,
          message: message,
          createdAt: ephemeralMsg.createdAt.toISOString(),
        });
      } catch (error) {
        logger.error("[chat:send_message] Error:", error);
      }
    });

    socket.on("chat:typing", (payload: { chatId: number }) => {
      socket.broadcast.to(`conv:${payload.chatId}`).emit("chat:typing", { chatId: payload.chatId });
    });

    socket.on("chat:stop_typing", (payload: { chatId: number }) => {
      socket.broadcast.to(`conv:${payload.chatId}`).emit("chat:stop_typing", { chatId: payload.chatId });
    });

    socket.on("agent:typing", (payload: { chatId: number }) => {
      socket.broadcast.to(`conv:${payload.chatId}`).emit("agent:typing", { chatId: payload.chatId });
    });

    socket.on("agent:stop_typing", (payload: { chatId: number }) => {
      socket.broadcast.to(`conv:${payload.chatId}`).emit("agent:stop_typing", { chatId: payload.chatId });
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

        // Clean up ephemeral messages
        ephemeralMessages.delete(chatId);

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

    // Save live chat as ticket (persists ephemeral messages to DB)
    socket.on("user:save_as_ticket", async (payload: { chatId: number; subject?: string }) => {
      try {
        const { chatId, subject } = payload;
        const chat = await prismaClient.conversation.findUnique({
          where: { id: chatId },
        });

        if (!chat || chat.userId !== userId) {
          socket.emit("chat:error", { message: "Chat not found" });
          return;
        }

        // Fix #14: Only allow saving closed/resolved chats
        if (!["CLOSED", "RESOLVED"].includes(chat.status)) {
          socket.emit("chat:error", { message: "Can only save closed or resolved chats" });
          return;
        }

        // Fix #8: Don't allow saving if already a ticket
        if (chat.type === "TICKET") {
          socket.emit("chat:error", { message: "Chat is already a ticket" });
          return;
        }

        // Get ephemeral messages
        const messages = ephemeralMessages.get(chatId) || [];

        if (messages.length === 0) {
          socket.emit("chat:error", { message: "No messages to save" });
          return;
        }

        // Convert LIVE_CHAT to TICKET and persist messages
        await prismaClient.conversation.update({
          where: { id: chatId },
          data: {
            type: "TICKET",
            subject: subject || "Live Chat Support",
            description: messages[0]?.content || "Chat transcript",
            status: "OPEN",
          },
        });

        // Persist all ephemeral messages to DB
        for (const msg of messages) {
          await prismaClient.message.create({
            data: {
              conversationId: chatId,
              senderId: msg.senderId,
              senderType: msg.senderType as any,
              messageType: "TEXT",
              content: msg.content,
              isAi: msg.isAi,
              createdAt: msg.createdAt,
            },
          });
        }

        // Clean up ephemeral messages
        ephemeralMessages.delete(chatId);

        socket.emit("chat:saved_as_ticket", { chatId, messageCount: messages.length });
        logger.info(`[user:save_as_ticket] Saved ${messages.length} messages for chat ${chatId}`);
      } catch (error) {
        logger.error("[user:save_as_ticket] Error:", error);
        socket.emit("chat:error", { message: "Failed to save chat as ticket" });
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
      namespace.emit("agent:status_changed", { online: true });
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
          },
        });

        if (fullChat) {
          // Get messages from ephemeral storage (in-memory)
          const chatMessages = ephemeralMessages.get(chatId) || [];
          socket.emit("agent:chat_taken", {
            chatId,
            chat: {
              id: fullChat.id,
              userId: fullChat.userId,
              userName: fullChat.user?.name || "Unknown",
              userEmail: fullChat.user?.email || "",
              userImage: fullChat.user?.image || null,
              messages: chatMessages.map((m) => ({
                id: nextEphemeralId(), // Fix #4: Use incrementing counter
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

        // Fix #5: Only allow messages in active chats
        if (chat.status !== "IN_PROGRESS") return;

        // Store message in memory (ephemeral)
        const ephemeralMsg: EphemeralMessage = {
          senderId: userId,
          senderType: "AGENT",
          content: message,
          isAi: false,
          createdAt: new Date(),
        };

        const existing = ephemeralMessages.get(chatId) || [];
        existing.push(ephemeralMsg);
        // Fix #9: Cap messages per chat
        if (existing.length > MAX_EPHEMERAL_MESSAGES) {
          existing.splice(0, existing.length - MAX_EPHEMERAL_MESSAGES);
        }
        ephemeralMessages.set(chatId, existing);

        // Update conversation lastMessageAt
        await prismaClient.conversation.update({
          where: { id: chatId },
          data: { lastMessageAt: new Date() },
        });

        // Fix #4: Use incrementing counter instead of Date.now()
        const msgId = nextEphemeralId();
        namespace.to(`conv:${chatId}`).emit("chat:message", {
          chatId,
          id: msgId,
          senderType: "AGENT",
          senderName: userName,
          message: message,
          createdAt: ephemeralMsg.createdAt.toISOString(),
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

        // Fix #16: Prevent double-close
        if (chat.status !== "IN_PROGRESS") return;

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

        // Clean up ephemeral messages
        ephemeralMessages.delete(chatId);

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

    socket.on("agent:offline", async () => {
      if (!isAgent) return;
      socket.leave("agent");
      await prismaClient.agentStatus.upsert({
        where: { userId },
        update: { status: "OFFLINE" },
        create: { userId, status: "OFFLINE" },
      }).catch(() => {});
      const online = await hasOnlineAgents();
      namespace.emit("agent:status_changed", { online });
      socket.emit("agent:status", { online: false });

      // Close all waiting chats if no agents available
      if (!online) {
        await closeWaitingChatsAndNotify(namespace, "No agents available");
      }

      // Send empty queue directly to this agent's socket
      // (they left the "agent" room, so they won't receive agent:queue_updated)
      socket.emit("agent:queue", []);
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

    // Cancel any pending disconnect timer for this user (grace period reconnect)
    if (!isAgent) {
      const pendingTimer = disconnectTimers.get(userId);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        disconnectTimers.delete(userId);
        logger.info(`User ${userName} reconnected within grace period — cancelled disconnect timer`);

        // Notify agents that the user is back
        const activeChats = await prismaClient.conversation.findMany({
          where: { userId, type: "LIVE_CHAT", status: "IN_PROGRESS" },
          select: { id: true },
        }).catch(() => []);
        for (const chat of activeChats) {
          namespace.to(`conv:${chat.id}`).emit("user:reconnected", { chatId: chat.id, userId });
        }
      }
    }

    try {
      if (isAgent) {
        await initAgentState(socket, userId, userName);
      }
      // Non-agents: initUserChatState is called via user:rejoin (frontend emits on connect)
      // Do NOT call it here — it would run twice and duplicate messages
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
          select: { id: true, status: true, assignedTo: true },
        }).catch(() => []);

        // Close WAITING_AGENT chats immediately — no grace period needed
        // (user is just in queue, no active conversation to protect)
        let hasWaitingAgent = false;
        for (const chat of activeChats) {
          if (chat.status === "WAITING_AGENT") {
            hasWaitingAgent = true;
            await prismaClient.conversation.update({
              where: { id: chat.id },
              data: { status: "CLOSED", resolvedAt: new Date() },
            }).catch(() => {});
            ephemeralMessages.delete(chat.id);
          }
        }

        if (hasWaitingAgent) {
          namespace.to("agent").emit("agent:queue_updated");
        }

        // Start grace period ONLY for IN_PROGRESS chats (user may reconnect to active agent)
        const inProgressChats = activeChats.filter((c) => c.status === "IN_PROGRESS");

        if (inProgressChats.length > 0) {
          logger.info(`User ${userName} disconnected — starting ${DISCONNECT_GRACE_MS / 1000}s grace period for ${inProgressChats.length} active chat(s)`);

          // Notify agent that user disconnected (show indicator)
          for (const chat of inProgressChats) {
            namespace.to(`conv:${chat.id}`).emit("user:disconnected", { chatId: chat.id, userId });
          }

          // Clear any existing timer for this user (safety)
          const existingTimer = disconnectTimers.get(userId);
          if (existingTimer) clearTimeout(existingTimer);

          // Set a new 30-second timer for IN_PROGRESS chats only
          const timer = setTimeout(async () => {
            logger.info(`Grace period expired for user ${userName} — closing active chats`);

            // Check if user reconnected while timer was pending
            if (!disconnectTimers.has(userId)) return;

            const chats = await prismaClient.conversation.findMany({
              where: {
                userId,
                type: "LIVE_CHAT",
                status: "IN_PROGRESS",
              },
            }).catch(() => []);

            // Check again after async DB query — user may have reconnected
            if (!disconnectTimers.has(userId)) return;

            for (const chat of chats) {
              // Check before each DB operation — user may have reconnected
              if (!disconnectTimers.has(userId)) return;

              await prismaClient.conversation.update({
                where: { id: chat.id },
                data: { status: "RESOLVED", resolvedAt: new Date() },
              }).catch(() => {});

              // Check again after async DB update
              if (!disconnectTimers.has(userId)) return;

              if (chat.assignedTo) {
                await prismaClient.agentStatus.update({
                  where: { userId: chat.assignedTo },
                  data: { currentChats: { decrement: 1 } },
                }).catch(() => {});
              }

              namespace.to(`conv:${chat.id}`).emit("chat:closed", {
                chatId: chat.id,
                reason: "User disconnected",
              });

              ephemeralMessages.delete(chat.id);
            }

            // Clean up timer entry (only reached if user didn't reconnect)
            disconnectTimers.delete(userId);

            // Notify agents to refresh their active chats
            if (chats.length > 0) {
              namespace.to("agent").emit("agent:queue_updated");
            }
          }, DISCONNECT_GRACE_MS);

          disconnectTimers.set(userId, timer);
        }
      }
    });
  });

  // Periodic cleanup: stale agents + stale queue (runs every 60 seconds)
  // Fix #10: Clear existing interval before creating new one
  if (cleanupInterval) clearInterval(cleanupInterval);
  cleanupInterval = setInterval(async () => {
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
          // Fix #6: Clean up ephemeral messages
          ephemeralMessages.delete(chat.id);
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
        const online = await hasOnlineAgents();
        namespace.emit("agent:status_changed", { online });
        namespace.to("agent").emit("agent:queue_updated");

        // Close all waiting chats if no agents left
        if (!online) {
          await closeWaitingChatsAndNotify(namespace, "No agents available");
        }
      }

      // 2. Close stale WAITING_AGENT conversations (older than 10 minutes)
      const queueTimeout = new Date(Date.now() - 10 * 60 * 1000);
      await closeWaitingChatsAndNotify(
        namespace,
        "No agents available",
        { olderThan: queueTimeout }
      );
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

  if (activeChats.length === 0) {
    // Check for recently closed conversations (closed while user was disconnected)
    const recentClosed = await prismaClient.conversation.findFirst({
      where: {
        userId,
        type: "LIVE_CHAT",
        status: { in: ["CLOSED", "RESOLVED"] },
        resolvedAt: { gte: new Date(Date.now() - 5 * 60 * 1000) }, // Last 5 minutes
      },
      orderBy: { resolvedAt: "desc" },
      select: { id: true },
    });

    if (recentClosed) {
      socket.emit("chat:closed", {
        chatId: recentClosed.id,
        reason: "No agents available",
      });
    }
    return;
  }

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

    // Get messages from ephemeral storage (in-memory)
    const recentMessages = ephemeralMessages.get(chat.id) || [];

    for (const msg of recentMessages) {
      socket.emit("chat:message", {
        chatId: chat.id,
        id: nextEphemeralId(), // Fix #4: Use incrementing counter
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

  const agentUserDetails = await prismaClient.userDetail.findMany({
    where: { role: { name: { in: SUPPORT_ROLES } } },
    select: { userId: true },
  });
  const agentUserIds = agentUserDetails.map(u => u.userId);

  const waitingChats = await prismaClient.conversation.findMany({
    where: {
      type: "LIVE_CHAT",
      status: "WAITING_AGENT",
      userId: { notIn: agentUserIds },
    },
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
      // Get messages from ephemeral storage (in-memory)
      messages: (ephemeralMessages.get(c.id) || []).map((m) => ({
        id: nextEphemeralId(), // Fix #4: Use incrementing counter
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

async function hasOnlineAgents(): Promise<boolean> {
  const staleThreshold = new Date(Date.now() - 60 * 1000);
  const count = await prismaClient.agentStatus.count({
    where: { status: "ONLINE", lastSeenAt: { gte: staleThreshold } },
  });
  return count > 0;
}

/**
 * Closes all WAITING_AGENT conversations (optionally filtered by age),
 * emits chat:closed to each user, and cleans up ephemeral messages.
 * Uses conditional updateMany to prevent duplicate emissions in race conditions.
 */
async function closeWaitingChatsAndNotify(
  namespace: Namespace,
  reason: string,
  filter?: { olderThan?: Date }
): Promise<number> {
  const where: any = { type: "LIVE_CHAT", status: "WAITING_AGENT" };
  if (filter?.olderThan) where.createdAt = { lt: filter.olderThan };

  const waitingChats = await prismaClient.conversation.findMany({
    where,
    select: { id: true, userId: true },
  });

  if (waitingChats.length === 0) return 0;

  let closedCount = 0;
  for (const chat of waitingChats) {
    // Conditional update — only succeeds if still WAITING_AGENT
    const result = await prismaClient.conversation.updateMany({
      where: { id: chat.id, status: "WAITING_AGENT" },
      data: { status: "CLOSED", resolvedAt: new Date() },
    });

    if (result.count > 0) {
      closedCount++;
      if (chat.userId) {
        namespace.to(`user:${chat.userId}`).emit("chat:closed", {
          chatId: chat.id,
          reason,
        });
      }
      ephemeralMessages.delete(chat.id);
    }
  }

  if (closedCount > 0) {
    namespace.to("agent").emit("agent:queue_updated");
  }

  return closedCount;
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
