import express from "express";
import cors, { type CorsOptions } from "cors";
import "dotenv/config";
import routes from "./routes/common";
import { sendSuccess } from "./utils/response";
import cookieParser from "cookie-parser";
import extractInfo from "./middlewares/extractInfo";
import logger from "./utils/logger";

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
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  exposedHeaders: ["Set-Cookie"],
  credentials: true,
};

const app = express();

app.use(cors(corsOptions));
app.use(cookieParser());

// app.get("/api/admin", async (req, res) => {
//   const session = await auth.api.getSession({
//     headers: fromNodeHeaders(req.headers as any),
//   });
//   if (!session || session.user.role !== "admin") {
//     return res.status(403).json({ error: "Forbidden" });
//   }

//   res.json({ message: `Welcome Admin ${session.user.email}` });
// });

app.use(express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf;
  }
}));
const apiVersion = "/api/";
app.use(apiVersion, routes);

app.use(extractInfo);

app.get("/health", (_, res) => {
  return sendSuccess(res, null, "Server is running");
});

app.listen(PORT, () => {
  logger.info(`Server is running on port: ${PORT}`);
});
