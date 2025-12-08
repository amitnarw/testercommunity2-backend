import {
  getUserProfileData,
  saveInitialProfileData,
} from "@/controllers/user.controller";
import Router from "express";

const router = Router();

router.get("/get-user-profile-data", getUserProfileData);
router.get("/initial-user-profile", saveInitialProfileData);

export default router;
