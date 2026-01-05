import Router from "express";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import { getAppCategories, getHubStats } from "@/controllers/hub.controller";

const router = Router();

router.get("/get-hub-stats", checkAuthentication, getHubStats);
router.get("/get-app-categories", checkAuthentication, getAppCategories);

export default router;
