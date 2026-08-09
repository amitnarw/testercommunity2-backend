import {
  getAllPricingPlans,
  getAllSessions,
  getNotifications,
  getUserData,
  getUserImmediateAttention,
  getUserProfileData,
  getWalletData,
  getUserTransactions,
  logOutFromAllSession,
  logOutFromSession,
  saveDiscoverySource,
  saveProfileData,
  getEnterprisePlan,
  toggleMyActiveStatus,
  reactivateAccount,
  checkEmailStatus,
} from "@/controllers/user.controller";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
// import { checkAuthorizationAccess } from "@/middlewares/checkAuthorization";
import { decryptPayload } from "@/middlewares/decyptPayload";
import Router from "express";

const router = Router();

router.get(
  "/get-user-data",
  checkAuthentication,
  // checkAuthorizationAccess,
  getUserData,
);
router.put(
  "/save-user-data",
  checkAuthentication,
  // checkAuthorizationAccess,
  getUserData,
);
router.get(
  "/get-user-profile-data",
  checkAuthentication,
  // checkAuthorizationAccess,
  getUserProfileData,
);
router.post(
  "/save-profile-data",
  checkAuthentication,
  decryptPayload,
  saveProfileData,
);
router.put(
  "/discovery-source",
  checkAuthentication,
  decryptPayload,
  saveDiscoverySource,
);

router.get("/get-notifications", checkAuthentication, getNotifications);
router.get("/get-all-pricing-plans", getAllPricingPlans);
router.get("/get-all-sessions", checkAuthentication, getAllSessions);
router.post(
  "/logout-single-session",
  checkAuthentication,
  decryptPayload,
  logOutFromSession,
);
router.post("/logout-all-sessions", checkAuthentication, logOutFromAllSession);
router.get("/get-user-wallet", checkAuthentication, getWalletData);
router.get("/get-user-transactions", checkAuthentication, getUserTransactions);
router.get("/get-immediate-attention", checkAuthentication, getUserImmediateAttention);
router.get("/get-enterprise-plan", getEnterprisePlan);
router.get("/check-email-status", checkEmailStatus);
router.post(
  "/me/status",
  checkAuthentication,
  decryptPayload,
  toggleMyActiveStatus,
);
router.post("/reactivate", decryptPayload, reactivateAccount);

export default router;
