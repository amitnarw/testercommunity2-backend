import express from "express";
import cors, { type CorsOptions } from "cors";
import "dotenv/config";
import routes from "./routes/common";
import { sendSuccess } from "./utils/response";
import cookieParser from "cookie-parser";
import extractInfo from "./middlewares/extractInfo";
import logger from "./utils/logger";
import { createSocketServer } from "./socket/socketServer";
import { scheduleHandshakeCrons } from "./services/cron.service";

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection", { reason });
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception", error);
});

const PORT = process.env.PORT;
const allowedOrigins = process.env.CORS_ORIGIN?.split(",") || [];

const corsOptions: CorsOptions = {
  origin: (origin: string | undefined, callback) => {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // In development, be more permissive
    if (process.env.NODE_ENV !== "production") {
      logger.warn(`CORS: Allowing origin '${origin}' in development mode`);
      return callback(null, true);
    }

    return callback(
      new Error(`CORS policy error: Origin '${origin}' not allowed`)
    );
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  exposedHeaders: ["Set-Cookie"],
  credentials: true,
};

const app = express();

app.use(cors(corsOptions));
app.use(cookieParser());

// P4: extractInfo must run BEFORE the API router ,  mounted after, it never
// saw matched requests and every controller read undefined ip/ua (empty
// audit-log metadata everywhere).
app.use(extractInfo);

app.use(express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf;
  }
}));
const apiVersion = "/api/";
app.use(apiVersion, routes);

app.get("/health", (_, res) => {
  return sendSuccess(res, null, "Server is running");
});

app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err?.code === "P2025") {
    logger.warn("Prisma P2025: Record not found", { model: err?.meta?.modelName });
    // P4: report failure honestly ,  a 200 "Operation completed" made
    // failed mutations look successful to clients.
    return res.status(404).json({ success: false, message: "Record not found" });
  }
  logger.error("Unhandled error", err);
  return res.status(500).json({ error: "Internal server error" });
});

const { httpServer } = createSocketServer(app);

httpServer.listen(PORT, () => {
  logger.info(`Server is running on port: ${PORT}`);
  scheduleHandshakeCrons();
});
