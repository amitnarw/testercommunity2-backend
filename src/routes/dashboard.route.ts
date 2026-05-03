import Router from "express";
import {
  addDashboardAppDraft,
  addDashboardAppSubmit,
  getDashboardStats,
  getDashboardApps,
  getAppsCount,
  deleteDashboardApp,
  getDashboardAppById,
} from "@/controllers/dashboard.controller";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import { decryptPayload } from "@/middlewares/decyptPayload";

const router = Router();

router.get("/get-dashboard-stats", checkAuthentication, getDashboardStats);
router.get("/get-dashboard-apps/:type", checkAuthentication, getDashboardApps);
router.get("/get-apps-count", checkAuthentication, getAppsCount);
router.get(
  "/get-dashboard-app/:id",
  checkAuthentication,
  getDashboardAppById,
);
router.post(
  "/add-dashboard-app-submit",
  checkAuthentication,
  decryptPayload,
  addDashboardAppSubmit,
);
router.post(
  "/add-dashboard-app-draft",
  checkAuthentication,
  decryptPayload,
  addDashboardAppDraft,
);
router.delete(
  "/delete-dashboard-app/:id",
  checkAuthentication,
  deleteDashboardApp,
);

export default router;
