/**
 * Payment Routes - Razorpay Integration
 * 
 * API endpoints for payment operations:
 * - GET /config - Get Razorpay configuration for frontend
 * - POST /order - Create a new payment order
 * - POST /verify - Verify payment after checkout
 * - GET /status/:orderId - Get payment status
 * - GET /history - Get user's payment history
 * - POST /refund - Initiate a refund
 * - POST /webhook - Handle Razorpay webhooks (no auth required)
 */

import { Router } from "express";
import {
    getConfig,
    createOrder,
    verifyPayment,
    getPaymentStatus,
    getPaymentHistory,
    handleWebhook,
    initiateRefund,
} from "../controllers/payment.controller";
import { checkAuthentication } from "@/middlewares/checkAuthentication";

const router = Router();

/**
 * Public Routes
 */

// Get Razorpay configuration
router.get("/config", getConfig);

// Webhook endpoint - Must be public, uses signature verification
router.post("/webhook", handleWebhook);

/**
 * Protected Routes (Require Authentication)
 */

// Create a new payment order
router.post("/order", checkAuthentication, createOrder);

// Verify payment after checkout completion
router.post("/verify", checkAuthentication, verifyPayment);

// Get payment status by order ID
router.get("/status/:orderId", checkAuthentication, getPaymentStatus);

// Get user's payment history
router.get("/history", checkAuthentication, getPaymentHistory);

// Initiate a refund (admin or order owner only)
router.post("/refund", checkAuthentication, initiateRefund);

export default router;
