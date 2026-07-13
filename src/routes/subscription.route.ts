import { Router } from "express";
import {
  createHandshakeSubscription,
  getMySubscription,
  cancelHandshakeSubscription,
  getSubscriptionStatus,
  getHandshakePlan,
  listHandshakeSubscriptionsAdmin,
  cancelHandshakeSubscriptionAdmin,
} from "@/controllers/subscription.controller";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import { decryptPayload } from "@/middlewares/decyptPayload";

const router = Router();

router.get("/plan", getHandshakePlan);
router.post(
  "/create",
  checkAuthentication,
  decryptPayload,
  createHandshakeSubscription,
);
router.get("/my", checkAuthentication, getMySubscription);
router.post(
  "/cancel",
  checkAuthentication,
  decryptPayload,
  cancelHandshakeSubscription,
);
router.get("/status/:id", checkAuthentication, getSubscriptionStatus);

router.get("/admin/list", checkAuthentication, listHandshakeSubscriptionsAdmin);
router.post(
  "/admin/cancel/:id",
  checkAuthentication,
  cancelHandshakeSubscriptionAdmin,
);

export default router;
