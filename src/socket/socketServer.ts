import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import type { Application } from "express";
import logger from "../utils/logger";
import { setupSupportSocket } from "./supportSocket";

const allowedOrigins = process.env.CORS_ORIGIN?.split(",") || [];

let io: SocketIOServer | null = null;
let httpServer: ReturnType<typeof createServer> | null = null;

export function createSocketServer(app: Application) {
  httpServer = createServer(app);

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin: string | undefined, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        if (process.env.NODE_ENV !== "production") {
          return callback(null, true);
        }
        return callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
      methods: ["GET", "POST"],
    },
    path: "/socket.io",
  });

  const supportNamespace = io.of("/support");
  setupSupportSocket(supportNamespace);

  // Log any events hitting the default namespace (misconfigured clients)
  io.on("connection", (socket) => {
    logger.warn(`[DefaultNS] Client connected to default '/' namespace instead of '/support'. Socket: ${socket.id}`);
    socket.onAny((event, ...args) => {
      logger.warn(`[DefaultNS] Unhandled event '${event}' on default namespace — client should connect to /support`);
    });
  });

  logger.info("Socket.IO server initialized on /support namespace");
  return { httpServer, io };
}

export function getIO(): SocketIOServer {
  if (!io) throw new Error("Socket.IO not initialized");
  return io;
}

export function getHttpServer() {
  if (!httpServer) throw new Error("HTTP server not initialized");
  return httpServer;
}
