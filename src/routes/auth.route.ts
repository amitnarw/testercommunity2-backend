import { auth } from "@/lib/auth";
import { toNodeHandler } from "better-auth/node";
import Router from "express";

const router = Router();

const authHandler = toNodeHandler(auth);

router.all("/{*any}", async (req, res, next) => {
  try {
    await authHandler(req, res);
  } catch (err: any) {
    if (err?.code === "P2025") {
      res.status(200).json({ message: "Operation completed" });
      return;
    }
    next(err);
  }
});

export default router;