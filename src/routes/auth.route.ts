import { auth } from "@/lib/auth";
import { toNodeHandler } from "better-auth/node";
import Router from "express";

const router = Router();

router.all("/*splat", toNodeHandler(auth));

export default router;
