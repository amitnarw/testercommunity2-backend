import {
  getFinanceDashboard,
  getFinanceOrders,
  getFinancePayments,
  getFinanceInvoices,
  getUserInvoices,
  updateInvoice,
  getInvoicePreview,
  generateDemoPayment,
  createInvoice,
  getFinanceRefunds,
  getFinanceWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  getFinancePricing,
  updateFinancePricing,
  getUserWalletDetail,
  getFinancePlans,
  listAdminPlans,
  createAdminPlan,
  updateAdminPlan,
  deleteAdminPlan,
  reorderAdminPlans,
  getFinancePaymentMethods,
} from "@/controllers/adminFinance.controller";
import { initiateRefund } from "@/controllers/billing.controller";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import { checkAuthorization } from "@/middlewares/checkAuthorization";
import { decryptPayload } from "@/middlewares/decyptPayload";
import Router from "express";

const router = Router();

router.use(checkAuthentication);

router.get("/dashboard", checkAuthorization({ module: "finance", action: "canReadList" }), getFinanceDashboard);
router.get("/orders", checkAuthorization({ module: "finance", action: "canReadList" }), getFinanceOrders);
router.get("/payments", checkAuthorization({ module: "finance", action: "canReadList" }), getFinancePayments);
router.get("/invoices", checkAuthorization({ module: "finance", action: "canReadList" }), getFinanceInvoices);
router.get("/invoices/user/:userId", checkAuthorization({ module: "finance", action: "canReadSingle" }), getUserInvoices);
router.post("/invoices/update", checkAuthorization({ module: "finance", action: "canUpdate" }), decryptPayload, updateInvoice);
router.get("/invoices/preview/:userId", checkAuthorization({ module: "finance", action: "canReadSingle" }), getInvoicePreview);
router.post("/invoices/demo-payment", checkAuthorization({ module: "finance", action: "canUpdate" }), decryptPayload, generateDemoPayment);
router.post("/invoices/create", checkAuthorization({ module: "finance", action: "canUpdate" }), decryptPayload, createInvoice);
router.get("/refunds", checkAuthorization({ module: "finance", action: "canReadList" }), getFinanceRefunds);
router.post("/refunds/create", checkAuthorization({ module: "finance", action: "canUpdate" }), decryptPayload, initiateRefund);
router.get("/withdrawals", checkAuthorization({ module: "finance", action: "canReadList" }), getFinanceWithdrawals);
router.post("/withdrawals/:id/approve", checkAuthorization({ module: "finance", action: "canUpdate" }), approveWithdrawal);
router.post("/withdrawals/:id/reject", checkAuthorization({ module: "finance", action: "canUpdate" }), decryptPayload, rejectWithdrawal);
router.get("/pricing", checkAuthorization({ module: "finance", action: "canReadList" }), getFinancePricing);
router.put("/pricing/:id", checkAuthorization({ module: "finance", action: "canUpdate" }), decryptPayload, updateFinancePricing);
router.get("/user/:userId/wallet", checkAuthorization({ module: "finance", action: "canReadSingle" }), getUserWalletDetail);
router.get("/plans", checkAuthorization({ module: "finance", action: "canReadList" }), getFinancePlans);
router.post("/plans", checkAuthorization({ module: "finance", action: "canCreate" }), decryptPayload, createAdminPlan);
router.put("/plans/reorder", checkAuthorization({ module: "finance", action: "canUpdate" }), decryptPayload, reorderAdminPlans);
router.put("/plans/:id", checkAuthorization({ module: "finance", action: "canUpdate" }), decryptPayload, updateAdminPlan);
router.delete("/plans/:id", checkAuthorization({ module: "finance", action: "canDelete" }), deleteAdminPlan);
router.get("/payment-methods", checkAuthorization({ module: "finance", action: "canReadList" }), getFinancePaymentMethods);

export default router;
