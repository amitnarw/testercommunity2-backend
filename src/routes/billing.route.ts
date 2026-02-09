import { Router } from "express";
import {
    createOrder,
    getBillingHistory,
    getPaymentConfig,
    getPendingOrders,
    verifyPayment,
    handleWebhook,
    initiateRefund,
} from "@/controllers/billing.controller";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import { decryptPayload } from "@/middlewares/decyptPayload";

const router = Router();

// Public webhook route (must be before others to ensure no auth/decryption conflicts)
router.post("/webhook", handleWebhook);

// Protected routes
router.get("/history", checkAuthentication, getBillingHistory);
router.get("/config", checkAuthentication, getPaymentConfig);
router.get("/pending-orders", checkAuthentication, getPendingOrders);

router.post("/create-order", checkAuthentication, decryptPayload, createOrder);
router.post("/verify-payment", checkAuthentication, decryptPayload, verifyPayment);
router.post("/refund", checkAuthentication, decryptPayload, initiateRefund);

export default router;
