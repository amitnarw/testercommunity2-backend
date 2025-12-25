import {
  getAllPricingPlans,
  getNotifications,
  getUserData,
  getUserProfileData,
  saveInitialProfileData,
  saveProfileData,
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
  getUserData
);
router.put(
  "/save-user-data",
  checkAuthentication,
  // checkAuthorizationAccess,
  getUserData
);
router.get(
  "/get-user-profile-data",
  checkAuthentication,
  // checkAuthorizationAccess,
  getUserProfileData
);
router.get(
  "/initial-user-profile",
  checkAuthentication,
  saveInitialProfileData
);
router.post(
  "/save-profile-data",
  checkAuthentication,
  decryptPayload,
  saveProfileData
);

router.get("/get-notifications", checkAuthentication, getNotifications);
router.get("/get-all-pricing-plans", getAllPricingPlans);

export default router;
