import Router from "express";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import {
  acceptSubmittedHubAppTestingRequest,
  addHubApp,
  addHubAppFeedback,
  addHubAppTestingRequest,
  deleteHubAppFeedback,
  getAppCategories,
  getAppsCount,
  getHubApps,
  getHubStats,
  getHubSubmittedApp,
  getSingleHubAppDetails,
  getSubmittedAppsCount,
  rejectSubmittedHubAppTestingRequest,
} from "@/controllers/hub.controller";
import { decryptPayload } from "@/middlewares/decyptPayload";

const router = Router();

router.get("/get-hub-stats", checkAuthentication, getHubStats);
router.get("/get-app-categories", checkAuthentication, getAppCategories);
router.post("/add-hub-app", checkAuthentication, decryptPayload, addHubApp);
router.get(
  "/submitted/get-hub-apps/:type",
  checkAuthentication,
  getHubSubmittedApp,
);
router.get(
  "/submitted/get-apps-count",
  checkAuthentication,
  getSubmittedAppsCount,
);

router.get("/get-hub-apps/:type", checkAuthentication, getHubApps);
router.get("/get-apps-count", checkAuthentication, getAppsCount);
router.get("/get-app-details/:id", checkAuthentication, getSingleHubAppDetails);
router.post(
  "/add-hub-testing-request",
  checkAuthentication,
  decryptPayload,
  addHubAppTestingRequest,
);
router.post(
  "/accept-hub-testing-request",
  checkAuthentication,
  decryptPayload,
  acceptSubmittedHubAppTestingRequest,
);
router.post(
  "/reject-hub-testing-request",
  checkAuthentication,
  decryptPayload,
  rejectSubmittedHubAppTestingRequest,
);

// Feedback
router.post(
  "/add-hub-feedback",
  checkAuthentication,
  decryptPayload,
  addHubAppFeedback,
);
// router.put(
//   "/update-hub-feedback",
//   checkAuthentication,
//   decryptPayload,
//   addHubAppFeedback,
// );
router.delete(
  "/delete-feedback/:id",
  checkAuthentication,
  decryptPayload,
  deleteHubAppFeedback,
);

export default router;
