import { Router } from "express";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import { checkAuthorization } from "@/middlewares/checkAuthorization";
import { decryptPayload } from "@/middlewares/decyptPayload";
import {
  awardEliteBadge,
  revokeEliteBadge,
  getUserEliteBadge,
  searchEliteBadgeUsers,
  listEliteBadgeHolders,
  listEliteBadgeActivity,
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
router.get(
  "/admin/user-search",
  checkAuthentication,
  checkAuthorization({ module: "users", action: "canReadList" }),
  searchEliteBadgeUsers,
);
router.get(
  "/admin/holders",
  checkAuthentication,
  checkAuthorization({ module: "users", action: "canReadList" }),
  listEliteBadgeHolders,
);
router.get(
  "/admin/activity",
  checkAuthentication,
  checkAuthorization({ module: "users", action: "canReadList" }),
  listEliteBadgeActivity,
);
router.get("/user/:userId", getUserEliteBadge);

export default router;
