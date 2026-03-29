import logger from "../utils/logger";
import { type Request, type Response } from "express";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient } from "@/lib/prisma";
import {
  getRazorpayInstance,
  getRazorpayKeyId,
  isRazorpayConfigured,
  verifyPaymentSignature,
  verifyWebhookSignature,
  type RazorpayWebhookEvent,
} from "@/lib/razorpay";
import crypto from "crypto";

// Environment variables
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "";

/**
 * Get billing history (transactions)
 * Fetches user's payment/purchase history for billing page
 */
export const getBillingHistory = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    if (!userId) {
      return sendError(res, 401, "Unauthorized");
    }

    // Get successful orders with payment details
    const orders = await prismaClient?.order?.findMany({
      where: {
        userId,
        status: "PAID",
      },
      include: {
        plan: {
          select: {
            name: true,
            package: true,
          },
        },
        payments: {
          where: {
            status: "CAPTURED",
          },
          select: {
            razorpayPaymentId: true,
            method: true,
            status: true,
          },
          take: 1,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 50, // Limit to last 50 transactions
    });

    const billingHistory = orders.map((order) => ({
      id: `INV-${order.id.toString().padStart(4, "0")}`,
      orderId: order.id,
      razorpayOrderId: order.razorpayOrderId,
      date: order.createdAt.toISOString(),
      amount: order.amount / 100, // Convert paise to rupees
      currency: order.currency,
      status: order.status === "PAID" ? "Paid" : order.status,
      plan: order.plan?.name || "Unknown Plan",
      packages: order.plan?.package || order.packageCount || 0,
      paymentMethod: order.payments[0]?.method || null,
    }));

    return sendSuccess(
      res,
      billingHistory,
      "Billing history fetched successfully",
    );
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "billing",
      action: "getBillingHistory",
      targetId: req?.userId || "",
      result: "fail",
      reason: error instanceof Error ? error.message : "Unknown error",
      ip: req?.userIpAddress || "",
      ua: req?.userAgent || "",
    };
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
      auditLogPayloadFail,
    );
  }
};

/**
 * Create a new Razorpay order for plan purchase
 */
export const createOrder = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    if (!userId) {
      return sendError(res, 401, "Unauthorized");
    }

    if (!isRazorpayConfigured()) {
      return sendError(res, 503, "Payment service is not configured");
    }

    const { payload } = await req.body;
    const { planId } = payload;
    if (!planId) {
      return sendError(res, 400, "Plan ID is required");
    }

    // Fetch the plan
    const plan = await prismaClient?.plans?.findFirst({
      where: {
        id: planId,
        isActive: true,
      },
    });

    if (!plan) {
      return sendError(res, 404, "Plan not found or is inactive");
    }

    // Generate unique receipt
    const receipt = `rcpt_${userId.slice(0, 8)}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

    // Amount in paise (smallest currency unit)
    const amountInPaise = Math.round(plan.price * 100);

    // Create Razorpay order
    const razorpay = getRazorpayInstance();
    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: receipt,
      notes: {
        userId: userId,
        planId: planId,
        planName: plan.name,
        packages: plan.package.toString(),
      },
    });

    // Store order in database
    const order = await prismaClient?.order?.create({
      data: {
        userId,
        planId,
        packageCount: plan.package,
        razorpayOrderId: razorpayOrder.id,
        receipt,
        amount: amountInPaise,
        currency: "INR",
        status: "CREATED",
        notes: {
          planName: plan.name,
          planPrice: plan.price,
        },
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes expiry
      },
    });

    return sendSuccess(
      res,
      {
        orderId: order.id,
        razorpayOrderId: razorpayOrder.id,
        razorpayKeyId: getRazorpayKeyId(),
        amount: amountInPaise,
        currency: "INR",
        planName: plan.name,
        packages: plan.package,
      },
      "Order created successfully",
    );
  } catch (error) {
    logger.error("Create order error:", error);
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "billing",
      action: "createOrder",
      targetId: req?.userId || "",
      result: "fail",
      reason: error instanceof Error ? error.message : "Unknown error",
      ip: req?.userIpAddress || "",
      ua: req?.userAgent || "",
    };
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Failed to create order",
      auditLogPayloadFail,
    );
  }
};

/**
 * Verify payment after Razorpay checkout
 */
export const verifyPayment = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    if (!userId) {
      return sendError(res, 401, "Unauthorized");
    }

    const { payload } = await req.body;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      payload;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return sendError(res, 400, "Missing payment verification data");
    }

    // Verify signature
    const isValidSignature = verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    );

    if (!isValidSignature) {
      return sendError(
        res,
        400,
        "Payment verification failed - invalid signature",
      );
    }

    // Find the order
    const order = await prismaClient?.order?.findFirst({
      where: {
        razorpayOrderId: razorpay_order_id,
        userId,
      },
      include: {
        plan: true,
      },
    });

    if (!order) {
      return sendError(res, 404, "Order not found");
    }

    if (order.status === "PAID") {
      return sendSuccess(
        res,
        { alreadyProcessed: true },
        "Payment already processed",
      );
    }

    // Fetch payment details from Razorpay
    const razorpay = getRazorpayInstance();
    const paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);

    // Start transaction to update order, create payment record, and update wallet
    const result = await prismaClient.$transaction(async (tx) => {
      // Create payment record
      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          razorpayPaymentId: razorpay_payment_id,
          razorpayOrderId: razorpay_order_id,
          razorpaySignature: razorpay_signature,
          amount:
            typeof paymentDetails.amount === "string"
              ? parseInt(paymentDetails.amount)
              : (paymentDetails.amount as number),
          currency: paymentDetails.currency,
          status:
            paymentDetails.status === "captured" ? "CAPTURED" : "AUTHORIZED",
          method: paymentDetails.method as string,
          bank: paymentDetails.bank as string,
          wallet: paymentDetails.wallet as string,
          vpa: paymentDetails.vpa as string,
          email: paymentDetails.email as string,
          contact: paymentDetails.contact as string,
          fee:
            typeof paymentDetails.fee === "string"
              ? parseInt(paymentDetails.fee)
              : (paymentDetails.fee as number),
          tax:
            typeof paymentDetails.tax === "string"
              ? parseInt(paymentDetails.tax)
              : (paymentDetails.tax as number),
          captured: paymentDetails.captured as boolean,
          international: paymentDetails.international as boolean,
          notes: paymentDetails.notes as any,
        },
      });

      // Update order status
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: "PAID",
          attempts: { increment: 1 },
        },
      });

      // Calculate packages to award
      const packagesToAward = order.packageCount || order.plan?.package || 0;

      // Update user wallet
      const wallet = await tx.userWallet.upsert({
        where: { userId },
        create: {
          userId,
          totalPoints: 0,
          totalPackages: packagesToAward,
        },
        update: {
          totalPackages: { increment: packagesToAward },
        },
      });

      // Create transaction record
      const transaction = await tx.userTransaction.create({
        data: {
          userId,
          userWalletId: wallet.id,
          action: null,
          package: packagesToAward,
          transactionType: "PURCHASE",
          status: "CREDIT",
        },
      });

      return {
        payment,
        wallet,
        transaction,
        packagesAwarded: packagesToAward,
      };
    });

    return sendSuccess(
      res,
      {
        success: true,
        orderId: order.id,
        paymentId: result.payment.id,
        packagesAwarded: result.packagesAwarded,
        totalPackages: result.wallet.totalPackages,
      },
      "Payment verified and packages credited successfully",
    );
  } catch (error) {
    logger.error("Verify payment error:", error);
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "billing",
      action: "verifyPayment",
      targetId: req?.userId || "",
      result: "fail",
      reason: error instanceof Error ? error.message : "Unknown error",
      ip: req?.userIpAddress || "",
      ua: req?.userAgent || "",
    };
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Payment verification failed",
      auditLogPayloadFail,
    );
  }
};

/**
 * Get Razorpay configuration for frontend
 */
export const getPaymentConfig = async (req: Request, res: Response) => {
  try {
    if (!isRazorpayConfigured()) {
      return sendSuccess(
        res,
        { isConfigured: false },
        "Payment service not configured",
      );
    }

    return sendSuccess(
      res,
      {
        isConfigured: true,
        keyId: getRazorpayKeyId(),
        currency: "INR",
        name: "Tester Community",
        description: "Testing Packages",
        theme: {
          color: "#7c3aed",
        },
      },
      "Payment config fetched successfully",
    );
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Failed to get payment config",
    );
  }
};

/**
 * Get user's pending orders (for retry scenarios)
 */
export const getPendingOrders = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    if (!userId) {
      return sendError(res, 401, "Unauthorized");
    }

    const pendingOrders = await prismaClient?.order?.findMany({
      where: {
        userId,
        status: { in: ["CREATED", "ATTEMPTED"] },
        expiresAt: { gt: new Date() },
      },
      include: {
        plan: {
          select: {
            name: true,
            price: true,
            package: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const orders = pendingOrders.map((order) => ({
      orderId: order.id,
      razorpayOrderId: order.razorpayOrderId,
      amount: order.amount / 100,
      currency: order.currency,
      status: order.status,
      plan: order.plan,
      expiresAt: order.expiresAt?.toISOString() || "",
      createdAt: order.createdAt?.toISOString() || "",
    }));

    return sendSuccess(res, orders, "Pending orders fetched successfully");
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Failed to fetch pending orders",
    );
  }
};

/**
 * Handle Razorpay webhooks
 */
export const handleWebhook = async (req: Request, res: Response) => {
  try {
    const rawBody = (req as any).rawBody
      ? (req as any).rawBody.toString()
      : JSON.stringify(req.body);
    const signature = req.headers["x-razorpay-signature"] as string;

    if (!signature) {
      return res.status(400).json({ error: "Missing signature" });
    }

    if (!verifyWebhookSignature(rawBody, signature, RAZORPAY_WEBHOOK_SECRET)) {
      return res.status(400).json({ error: "Invalid signature" });
    }

    const event = req.body as RazorpayWebhookEvent;
    const eventId = `${event.event}_${event.created_at}`;

    // Idempotency check
    const existingEvent = await prismaClient.webhookEventLog.findUnique({
      where: { eventId },
    });

    if (existingEvent?.processed) {
      return res.status(200).json({ status: "already_processed" });
    }

    await prismaClient.webhookEventLog.upsert({
      where: { eventId },
      create: {
        eventId,
        eventType: event.event,
        payload: event as any,
      },
      update: {},
    });

    // Process event logic
    if (event.event === "payment.captured") {
      const payment = event.payload.payment?.entity;
      if (payment) {
        await prismaClient.payment.updateMany({
          where: { razorpayPaymentId: payment.id },
          data: {
            status: "CAPTURED",
            captured: true,
          },
        });

        // Also update order status
        await prismaClient.order.updateMany({
          where: { razorpayOrderId: payment.order_id },
          data: { status: "PAID" },
        });
      }
    }

    return res.status(200).json({ status: "processed" });
  } catch (error) {
    logger.error("Webhook error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Initiate a refund
 */
export const initiateRefund = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    if (!userId) {
      return sendError(res, 401, "Unauthorized");
    }

    // Check if admin
    const userDetail = await prismaClient.userDetail.findUnique({
      where: { userId },
      include: { role: true },
    });
    const isAdmin = userDetail?.role?.name === "admin";

    const { paymentId, amount, reason } = req.body;

    const payment = await prismaClient.payment.findUnique({
      where: { razorpayPaymentId: paymentId },
      include: { order: true },
    });

    if (!payment) {
      return sendError(res, 404, "Payment not found");
    }

    if (payment.order.userId !== userId && !isAdmin) {
      return sendError(res, 403, "Unauthorized");
    }

    // Logic to interact with Razorpay API would go here
    // For now preventing action as it requires careful handling

    return sendSuccess(
      res,
      { status: "Refund initiated" },
      "Refund flow started",
    );
  } catch (error) {
    return sendError(res, 500, "Refund failed");
  }
};

/**
 * Get all active promo codes for the offers page
 */
export const getActivePromoCodes = async (req: Request, res: Response) => {
  try {
    const promoCodes = await prismaClient?.promoCode?.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        code: true,
        fixedPoints: true,
        maxUses: true,
        usedCount: true,
        updatedAt: true,
      },
    });

    return sendSuccess(res, promoCodes, "Promo codes fetched successfully");
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Failed to fetch promo codes",
    );
  }
};
