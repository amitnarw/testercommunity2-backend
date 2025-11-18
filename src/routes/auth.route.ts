import { auth } from "@/lib/auth";
import { toNodeHandler } from "better-auth/node";
import Router from "express";

const router = Router();

router.all("/{*any}", toNodeHandler(auth));
// router.all("/{*any}", (_, res)=>res.send('test'));

export default router;
