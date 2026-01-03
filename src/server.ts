import express from "express";
import cors, { type CorsOptions } from "cors";
import "dotenv/config";
import routes from "./routes/common";
import { sendSuccess } from "./utils/response";
import cookieParser from "cookie-parser";
import extractInfo from "./middlewares/extractInfo";

const PORT = process.env.PORT;
const allowedOrigins = process.env.CORS_ORIGIN?.split(",") || [];

const corsOptions: CorsOptions = {
  origin: (origin: string | undefined, callback) => {
    // Allow requests with no origin (server-to-server, like Vercel Edge Runtime middleware)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // In development, be more permissive
    if (process.env.NODE_ENV !== "production") {
      console.warn(`CORS: Allowing origin '${origin}' in development mode`);
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

// app.all("/api/auth{/*path}", toNodeHandler(auth));

// app.get("/api/profile", async (req, res) => {
//   const session = await auth.api.getSession({
//     headers: fromNodeHeaders(req.headers),
//   });

//   if (!session) {
//     return res.status(401).json({ error: "Not logged in" });
//   }

//   res.json({ user: session.user });
// });

// app.get("/api/admin", async (req, res) => {
//   const session = await auth.api.getSession({
//     headers: fromNodeHeaders(req.headers as any),
//   });
//   if (!session || session.user.role !== "admin") {
//     return res.status(403).json({ error: "Forbidden" });
//   }

//   res.json({ message: `Welcome Admin ${session.user.email}` });
// });

app.use(express.json());
const apiVersion = "/api/";
app.use(apiVersion, routes);

app.use(extractInfo);

app.get("/health", (_, res) => {
  return sendSuccess(res, null, "Server is running");
});

app.listen(PORT, () => {
  console.log(`Server is running on port: ${PORT}`);
});
