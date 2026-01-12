import Router from "express";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import {
  addHubApp,
  getAppCategories,
  getHubStats,
  getHubSubmittedApp,
  getSubmittedAppsCount,
} from "@/controllers/hub.controller";
import { decryptPayload } from "@/middlewares/decyptPayload";

const router = Router();

router.get("/get-hub-stats", checkAuthentication, getHubStats);
router.get("/get-app-categories", checkAuthentication, getAppCategories);
router.post("/add-hub-app", checkAuthentication, decryptPayload, addHubApp);
router.get(
  "/submitted/get-hub-apps/:type",
  checkAuthentication,
  getHubSubmittedApp
);
router.get(
  "/submitted/get-apps-count",
  checkAuthentication,
  getSubmittedAppsCount
);

export default router;
