import express from "express";
import cors from "cors";
import "dotenv/config";
import routes from "./routes/common";
import { sendSuccess } from "./utils/response";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth";
import { prismaClient } from "./lib/prisma";

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

app.use(cors(allowedOrigins));

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


// const apiVersion = "/api/v1/";
// app.use(apiVersion, routes);
app.all('/api/auth/{*any}', toNodeHandler(auth));
// app.all('/api/auth/{*any}', async (req, res)=>{
//   const response = await prismaClient?.user?.findMany();
//   console.log(response, '11111111111')
//   res.send(response)
// });
app.use(express.json());

app.get("/health", (_, res) => {
  return sendSuccess(res, 200, "Server is running");
});

app.listen(PORT, () => {
  console.log(`Server is running on port: ${PORT}`);
});
