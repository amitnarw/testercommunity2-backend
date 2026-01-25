import {
  getControlRoomData,
  getSubmittedApps,
  acceptApp,
  rejectApp,
  getSubmittedAppsCount,
} from "@/controllers/admin.controller";
import Router from "express";

const router = Router();

router.get("/get-control-room-data", getControlRoomData);
router.get("/get-submitted-apps", getSubmittedApps);
router.get("/get-submitted-apps-count", getSubmittedAppsCount);
router.post("/accept-app", acceptApp);
router.post("/reject-app", rejectApp);

export default router;
