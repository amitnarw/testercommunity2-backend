import Router from "express";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import {
  acceptSubmittedHubAppTestingRequest,
  addHubApp,
  addHubAppFeedback,
  updateHubAppFeedback,
  addHubAppTestingRequest,
  deleteHubAppFeedback,
  getAppCategories,
  getAppsCount,
  getHubApps,
  getHubStats,
  getHubSubmittedApp,
  getSingleHubAppDetails,
  getSubmittedAppsCount,
  validatePromoCode,
  resubmitHubApp,
  rejectSubmittedHubAppTestingRequest,
  submitDailyVerification,
  completeHostedApp,
} from "@/controllers/hub.controller";
import { decryptPayload } from "@/middlewares/decyptPayload";

const router = Router();

router.get("/get-hub-stats", checkAuthentication, getHubStats);
router.get("/get-app-categories", checkAuthentication, getAppCategories);
router.post("/add-hub-app", checkAuthentication, decryptPayload, addHubApp);
router.post("/resubmit-hub-app", checkAuthentication, decryptPayload, resubmitHubApp);
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

router.post(
  "/submit-daily-verification",
  checkAuthentication,
  decryptPayload,
  submitDailyVerification,
);

router.post(
  "/complete-hosted-app",
  checkAuthentication,
  decryptPayload,
  completeHostedApp,
);

// Feedback
router.post(
  "/add-hub-feedback",
  checkAuthentication,
  decryptPayload,
  addHubAppFeedback,
);
router.post(
  "/update-hub-feedback",
  checkAuthentication,
  decryptPayload,
  updateHubAppFeedback,
);
router.delete(
  "/delete-feedback/:id",
  checkAuthentication,
  deleteHubAppFeedback,
);

router.post(
  "/validate-promo",
  checkAuthentication,
  decryptPayload,
  validatePromoCode,
);

export default router;
