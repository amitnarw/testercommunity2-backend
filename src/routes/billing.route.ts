import { Router } from "express";
import {
  createOrder,
  getBillingHistory,
  getPaymentConfig,
  getPendingOrders,
  getOrderStatus,
  handleWebhook,
  initiateRefund,
  getActivePromoCodes,
  getBillingInfo,
  upsertBillingInfo,
  getPricing,
  getMyInvoices,
  getInvoice,
} from "@/controllers/billing.controller";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import { decryptPayload } from "@/middlewares/decyptPayload";

const router = Router();

// Public routes
router.post("/webhook", handleWebhook);
router.get("/promo-codes", getActivePromoCodes);
router.get("/pricing", getPricing);

// Protected routes
router.get("/history", checkAuthentication, getBillingHistory);
router.get("/config", checkAuthentication, getPaymentConfig);
router.get("/pending-orders", checkAuthentication, getPendingOrders);
router.get("/info", checkAuthentication, getBillingInfo);
router.get("/my-invoices", checkAuthentication, getMyInvoices);
router.get("/invoice/:invoiceNumber", checkAuthentication, getInvoice);
router.post("/info", checkAuthentication, decryptPayload, upsertBillingInfo);

router.post("/create-order", checkAuthentication, decryptPayload, createOrder);
router.get("/order-status/:orderId", checkAuthentication, getOrderStatus);
router.post("/refund", checkAuthentication, decryptPayload, initiateRefund);

export default router;
