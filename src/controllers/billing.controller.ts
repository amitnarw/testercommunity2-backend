import logger from "../utils/logger";
import { type Request, type Response } from "express";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient, Prisma } from "@/lib/prisma";
import {
  getRazorpayInstance,
  getRazorpayKeyId,
  isRazorpayConfigured,
  verifyPaymentSignature,
  verifyWebhookSignature,
  refundPayment,
  type RazorpayWebhookEvent,
} from "@/lib/razorpay";
import { sendEmail } from "@/services/resend";
import crypto from "crypto";
import { extractCountry } from "@/utils/helperFunctions";
import {
  getNextInvoiceNumber,
  calculateTax,
  determineInvoiceType,
  amountToWords,
  formatPeriod,
  getStateCodeFromName,
  getStateFromGstin,
  COMPANY_DETAILS,
} from "@/utils/invoice.utils";

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 5
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= maxRetries - 1) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const target = error.meta?.target as string[] | undefined;
        const targetStr = Array.isArray(target) ? target.join(",") : "";
        // Retry on any payment/invoice/order unique constraint collision
        if (!targetStr.includes("invoice_number") && !targetStr.includes("invoiceId") && !targetStr.includes("razorpayPaymentId")) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 100));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}

/**
 * Get billing info for the user
 */
export const getBillingInfo = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    if (!userId) {
      return sendError(res, 401, "Unauthorized");
    }

    const billingInfo = await prismaClient.billingInfo.findUnique({
      where: { userId },
    });

    return sendSuccess(res, billingInfo, "Billing info fetched successfully");
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
};

/**
 * Update or create billing info for the user
 */
export const upsertBillingInfo = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    const { payload } = req.body;
    const { name, email, address, city, state, zipCode, country, gstin } = payload;
    let { stateCode } = payload;

    if (!userId) {
      return sendError(res, 401, "Unauthorized");
    }

    if (!name || !email || !address || !country) {
      return sendError(res, 400, "Missing required fields");
    }

    if (!stateCode && gstin && country === "India") {
      const gstinResult = getStateFromGstin(gstin);
      if (gstinResult) {
        stateCode = gstinResult.stateCode;
      }
    }

    if (!stateCode && state && country === "India") {
      stateCode = getStateCodeFromName(state);
    }

    const billingInfo = await prismaClient.billingInfo.upsert({
      where: { userId },
      update: { name, email, address, city, state, stateCode, zipCode, country, gstin },
      create: { userId, name, email, address, city, state, stateCode, zipCode, country, gstin },
    });

    return sendSuccess(res, billingInfo, "Billing info updated successfully");
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
};

/**
 * Get localized pricing based on detected country
 */
export const getPricing = async (req: Request, res: Response) => {
  try {
    const countryCode = extractCountry(req);
    
    let pricing = await prismaClient.pricing.findUnique({
      where: { country_code: countryCode, is_active: true },
    });

    // Fallback to US if country not found
    if (!pricing) {
      pricing = await prismaClient.pricing.findUnique({
        where: { country_code: "US", is_active: true },
      });
    }

    return sendSuccess(res, pricing, "Pricing fetched successfully");
  } catch (error) {
    logger.error("Get pricing error:", error);
    return sendError(res, 500, "Failed to fetch pricing");
  }
};

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
      id: order.id.toString(),
      invoiceId: order.invoiceId,
      orderId: order.id,
      razorpayOrderId: order.razorpayOrderId,
      date: order.createdAt.toISOString(),
      amount: order.amount / 100, // Convert smallest unit to major unit
      currency: order.currency,
      status: order.status === "PAID" ? "Paid" : order.status,
      plan: order.plan?.name || "Unknown Plan",
      packages: order.plan?.package || order.packageCount || 0,
      paymentMethod: order.payments[0]?.method || null,
    }));

    return sendSuccess(
      res,
      billingHistory as any,
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
 * Get single invoice details for display/printing
 */
export const getInvoice = async (req: Request, res: Response) => {
  try {
    const { invoiceNumber } = req.params;
    if (!invoiceNumber || typeof invoiceNumber !== "string") {
      return sendError(res, 400, "Invoice number is required");
    }

    const invoice = await prismaClient.invoice.findUnique({
      where: { invoice_number: invoiceNumber as string },
      include: {
        payment: {
          include: {
            order: {
              include: {
                plan: true,
              },
            },
          },
        },
        user: {
          include: {
            billingInfo: true,
            userDetail: true,
          },
        },
      },
    });

    if (!invoice) {
      return sendError(res, 404, "Invoice not found");
    }

    // Check authorization
    if (req.userId !== invoice.userId && req.role !== "admin" && req.role !== "super_admin" && req.role !== "moderator" && req.role !== "support") {
      return sendError(res, 403, "Unauthorized to view this invoice");
    }

    return sendSuccess(res, invoice as any, "Invoice fetched successfully");
  } catch (error) {
    logger.error("Get invoice error:", error);
    return sendError(res, 500, "Failed to fetch invoice details");
  }
};

/**
 * Get all invoices for the authenticated user
 */
export const getMyInvoices = async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return sendError(res, 401, "Unauthorized");
    }

    const invoices = await prismaClient.invoice.findMany({
      where: { userId },
      include: {
        payment: {
          select: {
            amount: true,
            currency: true,
            status: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return sendSuccess(res, invoices as any, "Invoices fetched successfully");
  } catch (error) {
    logger.error("Get my invoices error:", error);
    return sendError(res, 500, "Failed to fetch your invoices");
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

    // Check if user has filled billing info
    const billingInfo = await prismaClient.billingInfo.findUnique({
      where: { userId },
    });

    if (!billingInfo) {
      return sendError(
        res,
        403,
        "Please fill your billing information before making a purchase",
        undefined,
        undefined,
        { billingInfoMissing: true }
      );
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

    // Get localized pricing
    const countryCode = extractCountry(req);
    let pricing = await prismaClient.pricing.findUnique({
      where: { country_code: countryCode, is_active: true },
    });

    // Fallback to US if country not found
    if (!pricing) {
      pricing = await prismaClient.pricing.findUnique({
        where: { country_code: "US", is_active: true },
      });
    }

    if (!pricing) {
      return sendError(res, 500, "Pricing not configured");
    }

    const amount = pricing.amount;
    const currency = pricing.currency_code;

    // Create Razorpay order
    const razorpay = getRazorpayInstance();
    const razorpayOrder = await razorpay.orders.create({
      amount: amount,
      currency: currency,
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
        amount: amount,
        currency: currency,
        status: "CREATED",
        notes: {
          planName: plan.name,
          planPrice: plan.price,
          currency_symbol: pricing.currency_symbol,
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
        amount: amount,
        currency: currency,
        currencySymbol: pricing.currency_symbol,
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
      const existingPayment = await prismaClient?.payment.findFirst({
        where: { razorpayOrderId: razorpay_order_id },
        orderBy: { createdAt: "desc" },
        include: { invoice: true },
      });
      return sendSuccess(
        res,
        {
          success: true,
          orderId: order.id,
          paymentId: existingPayment?.id || null,
          invoiceId: existingPayment?.invoice?.invoice_number || null,
          packagesAwarded: 0,
          totalPackages: 0,
          alreadyProcessed: true,
        },
        "Payment already processed",
      );
    }

    // Fetch payment details from Razorpay
    const razorpay = getRazorpayInstance();
    const paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);

    // Start transaction to update order, create payment record, and update wallet
    const transactionDate = new Date();
    const result = await withRetry(() =>
      prismaClient.$transaction(async (tx) => {
        // 🔒 Serialise concurrent requests for this order
        await tx.$executeRaw`SELECT id FROM "order" WHERE id = ${order.id} FOR UPDATE`;

        // Idempotency check: if a payment record already exists, return early
        const existingPayment = await tx.payment.findUnique({
          where: { razorpayPaymentId: razorpay_payment_id },
        });
        if (existingPayment) {
          const existingInvoice = await tx.invoice.findUnique({
            where: { paymentId: existingPayment.id },
          });
          const existingWallet = await tx.userWallet.findUnique({
            where: { userId },
          });
          return {
            alreadyProcessed: true,
            payment: existingPayment,
            invoiceId: existingInvoice?.invoice_number || null,
            packagesAwarded: 0,
            wallet: existingWallet || { totalPackages: 0 },
          };
        }

        // Get user billing info for payment record
        const billingInfo = await tx.billingInfo.findUnique({
          where: { userId },
        });

        // Determine invoice type and tax
        const customerCountry = billingInfo?.country || "India";
        const customerState = billingInfo?.state || null;
        const customerStateCode = billingInfo?.stateCode || (customerCountry === "India" ? getStateCodeFromName(customerState) : null);
        const invoiceType = determineInvoiceType(customerCountry);
        const invoiceNumber = await getNextInvoiceNumber(invoiceType, tx, transactionDate);

      // Calculate amount in INR (simplistic for now)
      const totalPaid = typeof paymentDetails.amount === "string"
        ? parseInt(paymentDetails.amount)
        : (paymentDetails.amount as number);
      const currency = paymentDetails.currency;
      let amountInr = currency === "INR" ? totalPaid : null;

      // Back-calculate base price (pre-GST) from the total the customer paid
      const quantity = order.packageCount || order.plan?.package || 1;
      const taxPreview = calculateTax(totalPaid, invoiceType, customerState, customerStateCode);
      const divisor = (100 + taxPreview.taxRate) / 100;
      const baseAmount = invoiceType === "EXP" ? totalPaid : Math.round(totalPaid / divisor);

      let taxInfo = calculateTax(baseAmount, invoiceType, customerState, customerStateCode);

      // Rounding adjustment: make base + tax match the exact amount collected
      const computedTotal = baseAmount + taxInfo.cgstAmount + taxInfo.sgstAmount + taxInfo.igstAmount;
      const roundingDiff = totalPaid - computedTotal;
      if (roundingDiff !== 0) {
        if (taxInfo.igstAmount > 0) {
          taxInfo.igstAmount += roundingDiff;
        } else {
          taxInfo.sgstAmount += roundingDiff;
        }
      }

      const unitPrice = Math.round(baseAmount / quantity);
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      // Create payment record (upsert for safety)
      const payment = await tx.payment.upsert({
        where: { razorpayPaymentId: razorpay_payment_id },
        update: {
          status: paymentDetails.status === "captured" ? "CAPTURED" : "AUTHORIZED",
        },
        create: {
          orderId: order.id,
          userId: userId,
          razorpayPaymentId: razorpay_payment_id,
          razorpayOrderId: razorpay_order_id,
          razorpaySignature: razorpay_signature,
          amount: totalPaid,
          currency: currency,
          amount_inr: amountInr,
          customer_name: billingInfo?.name || null,
          customer_email: billingInfo?.email || paymentDetails.email || null,
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

      // Create Invoice record (upsert for safety)
      await tx.invoice.upsert({
        where: { paymentId: payment.id },
        update: {},
        create: {
          paymentId: payment.id,
          userId: userId,
          invoice_number: invoiceNumber,
          invoice_type: invoiceType,
          service_name: order.plan?.name || "Android App Testing Package",
          sac_code: COMPANY_DETAILS.sacCode,
           period: formatPeriod(transactionDate),
          quantity: quantity,
          unit_price: unitPrice,
          tax_rate: taxInfo.taxRate,
          cgst_amount: taxInfo.cgstAmount,
          sgst_amount: taxInfo.sgstAmount,
          igst_amount: taxInfo.igstAmount,
          state_code: customerStateCode,
          due_date: dueDate,
          place_of_supply: taxInfo.placeOfSupply,
          supply_type: taxInfo.supplyType,
          amount_in_words: amountToWords(totalPaid, currency),
          lut_number: COMPANY_DETAILS.lutNumber || null,
        },
      });

      // Update order status and invoice ID (using the new invoiceNumber)
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: "PAID",
          attempts: { increment: 1 },
          invoiceId: invoiceNumber,
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
          // Packages are being credited to the wallet via real-money payment
          paymentMethod: "PACKAGE",
        },
      });

      return {
        payment,
        wallet,
        transaction,
        packagesAwarded: packagesToAward,
        invoiceId: invoiceNumber,
        alreadyProcessed: false,
      };
    })
  );

    // If another request already processed this payment, fetch current state
    if (result.alreadyProcessed) {
      const userWallet = await prismaClient?.userWallet.findUnique({
        where: { userId },
      });
      return sendSuccess(
        res,
        {
          success: true,
          orderId: order.id,
          paymentId: result.payment.id,
          invoiceId: result.invoiceId,
          packagesAwarded: result.packagesAwarded,
          totalPackages: userWallet?.totalPackages || 0,
          alreadyProcessed: true,
        },
        "Payment already processed",
      );
    }

    // Send receipt email
    const userEmail = paymentDetails.email || "";
    if (userEmail && process.env.RESEND_API_KEY) {
      const orderDate = order.createdAt.toISOString();
      const invoiceId = result.invoiceId;

      await sendEmail({
        from: "inTesters <noreply@intesters.com>",
        to: userEmail,
        subject: `Payment Receipt - ${invoiceId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #7c3aed;">Payment Successful!</h2>
            <p>Thank you for your purchase on inTesters.</p>
            <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Invoice ID:</strong> ${invoiceId}</p>
              <p><strong>Date:</strong> ${orderDate}</p>
              <p><strong>Amount:</strong> ₹${(order.amount / 100).toLocaleString("en-IN")}</p>
              <p><strong>Packages Awarded:</strong> ${result.packagesAwarded}</p>
              <p><strong>Total Packages:</strong> ${result.wallet.totalPackages}</p>
            </div>
            <p>You can view your packages and transaction history in your wallet.</p>
            <p>Thank you for choosing inTesters!</p>
          </div>
        `,
      });
    }

    return sendSuccess(
      res,
      {
        success: true,
        orderId: order.id,
        paymentId: result.payment.id,
        invoiceId: result.invoiceId,
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
        name: "inTesters",
        description: "Testing Packages",
        image: "https://intesters.com/apple-icon-dark.png",
        theme: {
          color: "#3c83f6",
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
      const paymentData = event.payload.payment?.entity;
      if (paymentData) {
        const order = await prismaClient.order.findFirst({
          where: { razorpayOrderId: paymentData.order_id },
          include: { plan: true },
        });

        if (order && order.status !== "PAID") {
          const userId = order.userId;

          const transactionDate = new Date();
          await withRetry(() =>
            prismaClient.$transaction(async (tx) => {
              // 🔒 Serialise concurrent requests for this order
              await tx.$executeRaw`SELECT id FROM "order" WHERE id = ${order.id} FOR UPDATE`;

              // Re-check order status inside the transaction (race condition guard)
              const currentOrder = await tx.order.findUnique({
                where: { id: order.id },
                select: { id: true, status: true },
              });
              if (!currentOrder || currentOrder.status === "PAID") {
                await tx.webhookEventLog.update({
                  where: { eventId },
                  data: { processed: true, processedAt: new Date() },
                });
                return;
              }

              const billingInfo = await tx.billingInfo.findUnique({
                where: { userId },
              });

              // Determine invoice type and tax
              const customerCountry = billingInfo?.country || "India";
              const customerState = billingInfo?.state || null;
              const customerStateCode = billingInfo?.stateCode || (customerCountry === "India" ? getStateCodeFromName(customerState) : null);
              const invoiceType = determineInvoiceType(customerCountry);
              const invoiceNumber = await getNextInvoiceNumber(invoiceType, tx, transactionDate);
            const totalPaid = paymentData.amount;
            const currency = paymentData.currency;
            let amountInr = currency === "INR" ? totalPaid : null;

            // Back-calculate base price (pre-GST) from the total the customer paid
            const quantity = order.packageCount || order.plan?.package || 1;
            const taxPreview = calculateTax(totalPaid, invoiceType, customerState, customerStateCode);
            const divisor = (100 + taxPreview.taxRate) / 100;
            const baseAmount = invoiceType === "EXP" ? totalPaid : Math.round(totalPaid / divisor);

            let taxInfo = calculateTax(baseAmount, invoiceType, customerState, customerStateCode);

            // Rounding adjustment: make base + tax match the exact amount collected
            const computedTotal = baseAmount + taxInfo.cgstAmount + taxInfo.sgstAmount + taxInfo.igstAmount;
            const roundingDiff = totalPaid - computedTotal;
            if (roundingDiff !== 0) {
              if (taxInfo.igstAmount > 0) {
                taxInfo.igstAmount += roundingDiff;
              } else {
                taxInfo.sgstAmount += roundingDiff;
              }
            }

            const unitPrice = Math.round(baseAmount / quantity);
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 30);

            // Upsert payment record
            const payment = await tx.payment.upsert({
              where: { razorpayPaymentId: paymentData.id },
              update: {
                status: "CAPTURED",
                captured: true,
                amount_inr: amountInr,
                customer_name: billingInfo?.name || null,
                customer_email: billingInfo?.email || paymentData.email || null,
              },
              create: {
                orderId: order.id,
                userId: userId,
                razorpayPaymentId: paymentData.id,
                razorpayOrderId: paymentData.order_id,
          amount: totalPaid,
                currency: currency,
                amount_inr: amountInr,
                customer_name: billingInfo?.name || null,
                customer_email: billingInfo?.email || paymentData.email || null,
                status: "CAPTURED",
                method: paymentData.method,
                email: paymentData.email,
                contact: paymentData.contact,
                captured: true,
              },
            });

            // Create Invoice if it doesn't exist
            await tx.invoice.upsert({
              where: { paymentId: payment.id },
              update: {},
              create: {
                paymentId: payment.id,
                userId: userId,
                invoice_number: invoiceNumber,
                invoice_type: invoiceType,
          service_name: order.plan?.name || "Android App Testing Package",
                sac_code: COMPANY_DETAILS.sacCode,
          period: formatPeriod(transactionDate),
                quantity: quantity,
                unit_price: unitPrice,
                tax_rate: taxInfo.taxRate,
                cgst_amount: taxInfo.cgstAmount,
                sgst_amount: taxInfo.sgstAmount,
                igst_amount: taxInfo.igstAmount,
                state_code: customerStateCode,
                due_date: dueDate,
                place_of_supply: taxInfo.placeOfSupply,
                supply_type: taxInfo.supplyType,
          amount_in_words: amountToWords(totalPaid, currency),
                lut_number: COMPANY_DETAILS.lutNumber || null,
              },
            });

            // Update order
            await tx.order.update({
              where: { id: order.id },
              data: {
                status: "PAID",
                invoiceId: invoiceNumber,
              },
            });

            // Wallet update
            const packagesToAward = order.packageCount || order.plan?.package || 0;
            const wallet = await tx.userWallet.upsert({
              where: { userId },
              create: { userId, totalPackages: packagesToAward },
              update: { totalPackages: { increment: packagesToAward } },
            });

            await tx.userTransaction.create({
              data: {
                userId,
                userWalletId: wallet.id,
                package: packagesToAward,
                transactionType: "PURCHASE",
                status: "CREDIT",
                paymentMethod: "PACKAGE",
              },
            });

            // Mark webhook event as processed (atomic with payment)
            await tx.webhookEventLog.update({
              where: { eventId },
              data: { processed: true, processedAt: new Date() },
            });
          })
        );
      }
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
    const isAdmin = userDetail?.role?.name === "admin" || userDetail?.role?.name === "super_admin";

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

    // Check if payment is eligible for refund (must be captured)
    if (payment.status !== "CAPTURED") {
      return sendError(res, 400, "Payment is not eligible for refund");
    }

    // Check if already refunded
    if (payment.refundStatus === "FULL" || payment.amountRefunded > 0) {
      return sendError(res, 400, "Payment has already been refunded");
    }

    // Call Razorpay refund API
    const amountInPaise = amount ? Math.round(amount * 100) : undefined;
    const refundResult = await refundPayment(paymentId, amountInPaise, {
      reason: reason || "Customer requested refund",
    });

    // Create refund record in database
    const refund = await prismaClient.refund.create({
      data: {
        paymentId: payment.id,
        razorpayRefundId: refundResult.razorpayRefundId,
        razorpayPaymentId: paymentId,
        amount: refundResult.amount,
        currency: payment.currency,
        status: refundResult.status === "processed" ? "PROCESSED" : "PENDING",
        reason,
        speed: "normal",
        processedAt: refundResult.status === "processed" ? new Date() : null,
      },
    });

    // Update payment record with refund info
    await prismaClient.payment.update({
      where: { id: payment.id },
      data: {
        amountRefunded: refundResult.amount,
        refundStatus:
          refundResult.status === "processed" ? "FULL" : "PARTIAL",
      },
    });

    // If full refund, deduct packages from wallet
    if (refundResult.status === "processed") {
      const order = await prismaClient.order.findUnique({
        where: { id: payment.orderId },
      });

      if (order) {
        const packagesToDeduct = order.packageCount || 0;

        // Update user wallet
        await prismaClient.userWallet.update({
          where: { userId },
          data: {
            totalPackages: { decrement: packagesToDeduct },
          },
        });

        // Create transaction record
        await prismaClient.userTransaction.create({
          data: {
            userId,
            action: null,
            package: packagesToDeduct,
            transactionType: "REFUND",
            status: "DEBIT",
            // Refund deducts packages
            paymentMethod: "PACKAGE",
          },
        });
      }
    }

    return sendSuccess(
      res,
      {
        refundId: refund.id,
        razorpayRefundId: refundResult.razorpayRefundId,
        status: refundResult.status,
        amount: refundResult.amount,
      },
      "Refund processed successfully",
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
        discountType: true,
        discountValue: true,
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
