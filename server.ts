import express from "express";
import cors from "cors";
import "dotenv/config";
import { auth } from "./src/lib/auth";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";

const PORT = process.env.PORT;
const origin = process.env.CORS_ORIGIN;

const allowedOrigins = {
  origin: origin,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  exposedHeaders: ["Set-Cookie"],
  credentials: true,
};

const app = express();

app.use(express.json());
app.use(cors(allowedOrigins));

app.all("/api/auth/*", toNodeHandler(auth));

app.get("/api/profile", async (req, res) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!session) {
    return res.status(401).json({ error: "Not logged in" });
  }

  res.json({ user: session.user });
});

app.get("/api/admin", async (req, res) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers as any),
  });
  if (!session || session.user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }

  res.json({ message: `Welcome Admin ${session.user.email}` });
});

app.listen(PORT, () => {
  console.log(`Server is running on port: ${PORT}`);
});
