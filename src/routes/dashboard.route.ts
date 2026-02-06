import Router from "express";
import {
  addDashboardAppDraft,
  addDashboardAppSubmit,
  getDashboardStats,
} from "@/controllers/dashboard.controller";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import { decryptPayload } from "@/middlewares/decyptPayload";

const router = Router();

router.get("/get-dashboard-stats", checkAuthentication, getDashboardStats);
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

export default router;
