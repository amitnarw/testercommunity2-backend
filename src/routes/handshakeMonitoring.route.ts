import { Router } from "express";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import { checkAuthorization } from "@/middlewares/checkAuthorization";
import { decryptPayload } from "@/middlewares/decyptPayload";
import {
  getMonitoringOverview,
  getWaitingCampaigns,
  getPenalizedUsers,
  getRecentMissedDays,
  adminReplaceTester,
  adminForceHandshake,
} from "@/controllers/handshakeMonitoring.controller";

const router = Router();

router.get(
  "/overview",
  checkAuthentication,
  checkAuthorization({ module: "submissions", action: "canReadList" }),
  getMonitoringOverview,
);
router.get(
  "/waiting",
  checkAuthentication,
  checkAuthorization({ module: "submissions", action: "canReadList" }),
  getWaitingCampaigns,
);
router.get(
  "/penalized",
  checkAuthentication,
  checkAuthorization({ module: "submissions", action: "canReadList" }),
  getPenalizedUsers,
);
router.get(
  "/missed-days",
  checkAuthentication,
  checkAuthorization({ module: "submissions", action: "canReadList" }),
  getRecentMissedDays,
);
router.post(
  "/replace-tester",
  checkAuthentication,
  checkAuthorization({ module: "submissions", action: "canUpdate" }),
  decryptPayload,
  adminReplaceTester,
);
router.post(
  "/force-handshake",
  checkAuthentication,
  checkAuthorization({ module: "submissions", action: "canUpdate" }),
  decryptPayload,
  adminForceHandshake,
);

export default router;
