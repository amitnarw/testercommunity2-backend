import Router from "express";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import {
  addHubApp,
  getAppCategories,
  getAppsCount,
  getHubApps,
  getHubStats,
  getHubSubmittedApp,
  getSingleHubAppDetails,
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
router.get("/get-hub-apps/:type", checkAuthentication, getHubApps);
router.get("/get-apps-count", checkAuthentication, getAppsCount);
router.get("/get-app-details/:id", checkAuthentication, getSingleHubAppDetails);

export default router;
