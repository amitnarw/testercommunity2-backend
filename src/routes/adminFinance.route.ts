import {
  getFinanceDashboard,
  getFinanceOrders,
  getFinancePayments,
  getFinanceInvoices,
  getUserInvoices,
  updateInvoice,
  getFinanceRefunds,
  getFinanceWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  getFinancePricing,
  updateFinancePricing,
  getUserWalletDetail,
  getFinancePlans,
  getFinancePaymentMethods,
} from "@/controllers/adminFinance.controller";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import { decryptPayload } from "@/middlewares/decyptPayload";
import Router from "express";

const router = Router();

router.use(checkAuthentication);

router.get("/dashboard", getFinanceDashboard);
router.get("/orders", getFinanceOrders);
router.get("/payments", getFinancePayments);
router.get("/invoices", getFinanceInvoices);
router.get("/invoices/user/:userId", getUserInvoices);
router.post("/invoices/update", decryptPayload, updateInvoice);
router.get("/refunds", getFinanceRefunds);
router.get("/withdrawals", getFinanceWithdrawals);
router.post("/withdrawals/:id/approve", approveWithdrawal);
router.post("/withdrawals/:id/reject", decryptPayload, rejectWithdrawal);
router.get("/pricing", getFinancePricing);
router.put("/pricing/:id", decryptPayload, updateFinancePricing);
router.get("/user/:userId/wallet", getUserWalletDetail);
router.get("/plans", getFinancePlans);
router.get("/payment-methods", getFinancePaymentMethods);

export default router;
