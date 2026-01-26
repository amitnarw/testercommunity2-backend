import {
  getControlRoomData,
  getSubmittedApps,
  acceptApp,
  rejectApp,
  getSubmittedAppsCount,
} from "@/controllers/admin.controller";
import { decryptPayload } from "@/middlewares/decyptPayload";
import Router from "express";

const router = Router();

router.get("/get-control-room-data", getControlRoomData);
router.get("/get-submitted-apps", getSubmittedApps);
router.get("/get-submitted-apps-count", getSubmittedAppsCount);
router.post("/accept-app", decryptPayload, acceptApp);
router.post("/reject-app", decryptPayload, rejectApp);

export default router;
