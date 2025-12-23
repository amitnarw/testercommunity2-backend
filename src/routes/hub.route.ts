import Router from "express";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import { getHubStats } from "@/controllers/hub.controller";

const router = Router();

router.get("/get-hub-stats", checkAuthentication, getHubStats);

export default router;
