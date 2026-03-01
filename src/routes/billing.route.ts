import { Router } from "express";
import {
  createOrder,
  getBillingHistory,
  getPaymentConfig,
  getPendingOrders,
  verifyPayment,
  handleWebhook,
  initiateRefund,
  getActivePromoCodes,
} from "@/controllers/billing.controller";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import { decryptPayload } from "@/middlewares/decyptPayload";

const router = Router();

// Public routes
router.post("/webhook", handleWebhook);
router.get("/promo-codes", getActivePromoCodes);

// Protected routes
router.get("/history", checkAuthentication, getBillingHistory);
router.get("/config", checkAuthentication, getPaymentConfig);
router.get("/pending-orders", checkAuthentication, getPendingOrders);

router.post("/create-order", checkAuthentication, decryptPayload, createOrder);
router.post(
  "/verify-payment",
  checkAuthentication,
  decryptPayload,
  verifyPayment,
);
router.post("/refund", checkAuthentication, decryptPayload, initiateRefund);

export default router;
