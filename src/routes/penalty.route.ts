import { Router } from "express";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import { checkAuthorization } from "@/middlewares/checkAuthorization";
import { decryptPayload } from "@/middlewares/decyptPayload";
import {
  getMyPenalties,
  submitPenaltyProof,
  submitPenaltyDailyProof,
  assignPenaltyApp,
  verifyPenaltyTask,
  listAllPenalties,
} from "@/controllers/penalty.controller";

const router = Router();

router.get("/me", checkAuthentication, getMyPenalties);
router.post(
  "/:taskId/submit",
  checkAuthentication,
  decryptPayload,
  submitPenaltyProof,
);
router.post(
  "/:taskId/daily-proof",
  checkAuthentication,
  decryptPayload,
  submitPenaltyDailyProof,
);
router.post(
  "/:taskId/assign-app",
  checkAuthentication,
  checkAuthorization({ module: "submissions", action: "canUpdate" }),
  decryptPayload,
  assignPenaltyApp,
);
router.post(
  "/:taskId/verify",
  checkAuthentication,
  checkAuthorization({ module: "submissions", action: "canUpdate" }),
  decryptPayload,
  verifyPenaltyTask,
);
router.get(
  "/admin/all",
  checkAuthentication,
  checkAuthorization({ module: "submissions", action: "canReadList" }),
  listAllPenalties,
);

export default router;
