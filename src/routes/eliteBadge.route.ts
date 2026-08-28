import { Router } from "express";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import { checkAuthorization } from "@/middlewares/checkAuthorization";
import { decryptPayload } from "@/middlewares/decyptPayload";
import {
  awardEliteBadge,
  revokeEliteBadge,
  getUserEliteBadge,
} from "@/controllers/eliteBadge.controller";

const router = Router();

router.post(
  "/admin/award",
  checkAuthentication,
  checkAuthorization({ module: "users", action: "canUpdate" }),
  decryptPayload,
  awardEliteBadge,
);
router.post(
  "/admin/revoke",
  checkAuthentication,
  checkAuthorization({ module: "users", action: "canUpdate" }),
  decryptPayload,
  revokeEliteBadge,
);
router.get("/user/:userId", getUserEliteBadge);

export default router;
