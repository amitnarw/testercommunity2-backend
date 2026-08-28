import { Router } from "express";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import {
  getMyLevel,
  getLeaderboard,
  getLevelConfig,
} from "@/controllers/level.controller";

const router = Router();

router.get("/me", checkAuthentication, getMyLevel);
router.get("/leaderboard", getLeaderboard);
router.get("/config", getLevelConfig);

export default router;
