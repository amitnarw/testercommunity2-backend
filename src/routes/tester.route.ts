import Router from "express";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import { decryptPayload } from "@/middlewares/decyptPayload";
import {
  getTesterProjects,
  updateTesterAvailability,
  rateApp,
  getTesterEarnings,
  getTesterEarningHistory,
  requestWithdrawal,
  getWithdrawalHistory,
  getTesterActivities,
} from "@/controllers/tester.controller";

const router = Router();

router.get("/get-projects", checkAuthentication, getTesterProjects);
router.put(
  "/availability",
  checkAuthentication,
  decryptPayload,
  updateTesterAvailability,
);
router.post("/rate-app", checkAuthentication, decryptPayload, rateApp);
router.get("/earnings", checkAuthentication, getTesterEarnings);
router.get("/earning-history", checkAuthentication, getTesterEarningHistory);
router.post("/withdrawal", checkAuthentication, requestWithdrawal);
router.get("/withdrawal-history", checkAuthentication, getWithdrawalHistory);
router.get("/activities", checkAuthentication, getTesterActivities);

export default router;
