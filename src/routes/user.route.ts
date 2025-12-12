import {
  getUserProfileData,
  saveInitialProfileData,
  saveProfileDate,
} from "@/controllers/user.controller";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import { checkAuthorizationAccess } from "@/middlewares/checkAuthorization";
import { decryptPayload } from "@/middlewares/decyptPayload";
import Router from "express";

const router = Router();

router.get(
  "/get-user-profile-data",
  checkAuthentication,
  // checkAuthorizationAccess,
  getUserProfileData
);
router.get("/initial-user-profile", saveInitialProfileData);
router.post(
  "/save-profile-data",
  checkAuthentication,
  decryptPayload,
  saveProfileDate
);

export default router;
