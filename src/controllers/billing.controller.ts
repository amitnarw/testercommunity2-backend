import logger from "../utils/logger";
import { type Request, type Response } from "express";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient, Prisma } from "@/lib/prisma";
import {
  getRazorpayInstance,
  getRazorpayKeyId,
  isRazorpayConfigured,
  verifyWebhookSignature,
  refundPayment,
  type RazorpayWebhookEvent,
} from "@/lib/razorpay";
import { sendEmail } from "@/services/resend";
import { paymentReceiptEmailHtml, EMAIL_BRAND } from "@/services/email-templates";
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
    const { name, email, phone, address, city, state, zipCode, country, gstin } = payload;
    let { stateCode } = payload;

    if (!userId) {
      return sendError(res, 401, "Unauthorized");
    }

    if (!name || !email || !phone || !address || !country) {
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
      update: { name, email, phone, address, city, state, stateCode, zipCode, country, gstin },
      create: { userId, name, email, phone, address, city, state, stateCode, zipCode, country, gstin },
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
      take: 50,
    });

    // Build one-time order billing history
    const orderHistory = orders.map((order) => ({
      id: order.id.toString(),
      type: "ONE_TIME",
      invoiceId: order.invoiceId,
      orderId: order.id,
      razorpayOrderId: order.razorpayOrderId,
      date: order.createdAt.toISOString(),
      amount: order.amount / 100,
      currency: order.currency,
      status: "Paid",
      plan: order.plan?.name || "Unknown Plan",
      packages: order.plan?.package || order.packageCount || 0,
      paymentMethod: order.payments[0]?.method || null,
    }));

    // Merge and sort by date descending
    const billingHistory = orderHistory
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 50);

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
            refunds: {
              where: { status: "PROCESSED" },
              orderBy: { createdAt: "asc" },
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
    if (req.userId !== invoice.userId && !req.isAdmin) {
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
            amountRefunded: true,
            refundStatus: true,
            refunds: {
              where: { status: "PROCESSED" },
              select: { id: true, amount: true, status: true, reason: true, razorpayRefundId: true, createdAt: true },
            },
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

    if (!billingInfo || !billingInfo.phone) {
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
 * Get order status for polling
 */
export const getOrderStatus = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    if (!userId) {
      return sendError(res, 401, "Unauthorized");
    }

    const orderId = req.params.orderId as string;
    if (!orderId) {
      return sendError(res, 400, "Order ID is required");
    }

    const order = await prismaClient.order.findFirst({
      where: {
        razorpayOrderId: orderId,
        userId,
      },
    });

    if (!order) {
      return sendError(res, 404, "Order not found");
    }

    const payment = await prismaClient.payment.findFirst({
      where: {
        orderId: order.id,
        ...(order.status === "PAID" ? { status: "CAPTURED" } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    return sendSuccess(res, {
      status: order.status,
      invoiceId: order.invoiceId,
      packagesAwarded: order.status === "PAID" ? order.packageCount : 0,
      paymentId: payment?.id || null,
      amount: order.amount,
      currency: order.currency,
      errorReason: payment?.errorReason || null,
    });
  } catch (error) {
    logger.error("Get order status error:", error);
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
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

    if (!RAZORPAY_WEBHOOK_SECRET) {
      return res.status(500).json({ error: "Webhook secret not configured" });
    }

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
                contact: billingInfo?.phone || paymentData.contact || null,
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
                contact: billingInfo?.phone || paymentData.contact || null,
                status: "CAPTURED",
                method: paymentData.method,
                email: paymentData.email,
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

          // Non-blocking receipt email after transaction is committed
          const userEmail = paymentData.email || "";
          if (userEmail && process.env.RESEND_API_KEY) {
            const currency = paymentData.currency || "INR";
            const amountInr = currency === "INR" ? paymentData.amount / 100 : paymentData.amount / 100;
            sendEmail({
              from: EMAIL_BRAND.from,
              to: userEmail,
              subject: `Payment Successful | inTesters`,
              html: paymentReceiptEmailHtml({
                amount: amountInr.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }),
                currency,
                paymentId: paymentData.id,
                description: order?.plan?.name || "inTesters purchase",
              }),
            }).catch((err) => {
              logger.error("Failed to send receipt email:", err);
            });
          }
        }
      }

      // Mark processed if the transaction didn't (order not found or already PAID)
      prismaClient.webhookEventLog.update({
        where: { eventId },
        data: { processed: true, processedAt: new Date() },
      }).catch(() => {});

      return res.status(200).json({ status: "processed" });
    }

    if (event.event === "payment.failed") {
      const paymentData = event.payload.payment?.entity;
      if (paymentData) {
        const order = await prismaClient.order.findFirst({
          where: { razorpayOrderId: paymentData.order_id },
          include: { plan: true },
        });

        if (order) {
          const transactionDate = new Date();
          await withRetry(() =>
            prismaClient.$transaction(async (tx) => {
              await tx.$executeRaw`SELECT id FROM "order" WHERE id = ${order.id} FOR UPDATE`;

              const currentOrder = await tx.order.findUnique({
                where: { id: order.id },
                select: { id: true, status: true },
              });
              if (!currentOrder || currentOrder.status === "PAID" || currentOrder.status === "FAILED") {
                await tx.webhookEventLog.update({
                  where: { eventId },
                  data: { processed: true, processedAt: new Date() },
                });
                return;
              }

              await tx.order.update({
                where: { id: order.id },
                data: { status: "FAILED" },
              });

              await tx.payment.upsert({
                where: { razorpayPaymentId: paymentData.id },
                create: {
                  razorpayPaymentId: paymentData.id,
                  razorpayOrderId: paymentData.order_id,
                  amount: paymentData.amount,
                  currency: paymentData.currency || "INR",
                  status: "FAILED",
                  method: paymentData.method,
                  email: paymentData.email,
                  contact: paymentData.contact,
                  bank: paymentData.bank,
                  wallet: paymentData.wallet,
                  vpa: paymentData.vpa,
                  fee: paymentData.fee,
                  tax: paymentData.tax,
                  errorCode: paymentData.error_code,
                  errorDescription: paymentData.error_description,
                  errorReason: paymentData.error_reason,
                  captured: paymentData.captured,
                  international: paymentData.international,
                  webhookVerified: true,
                  webhookPayload: paymentData as any,
                  userId: order.userId,
                  orderId: order.id,
                },
                update: {
                  status: "FAILED",
                  errorCode: paymentData.error_code,
                  errorDescription: paymentData.error_description,
                  errorReason: paymentData.error_reason,
                  webhookVerified: true,
                  webhookPayload: paymentData as any,
                },
              });

              await tx.webhookEventLog.update({
                where: { eventId },
                data: { processed: true, processedAt: new Date() },
              });
            })
          );
        }
      }

      // Mark processed if order was not found
      prismaClient.webhookEventLog.update({
        where: { eventId },
        data: { processed: true, processedAt: new Date() },
      }).catch(() => {});

      return res.status(200).json({ status: "processed" });
    }

    // Note: Subscription webhook events were historically handled here but the
    // Handshake Subscription system has been removed. Subscription.* events
    // are now ignored.

    // Handle refund events (covers admin dashboard-initiated refunds)
    if (event.event.startsWith("refund.")) {
      const refundEntity = event.payload.refund?.entity;
      if (!refundEntity) {
        logger.warn("Refund webhook missing refund entity");
        return res.status(200).json({ status: "skipped" });
      }

      const paymentId = refundEntity.payment_id;
      const refundAmount = refundEntity.amount;
      const razorpayRefundId = refundEntity.id;
      const refundStatus = refundEntity.status;

      const payment = await prismaClient.payment.findUnique({
        where: { razorpayPaymentId: paymentId },
        include: { order: { include: { plan: true } } },
      });

      if (!payment) {
        logger.warn(`Refund webhook for unknown payment: ${paymentId}`);
        await prismaClient.webhookEventLog.update({
          where: { eventId },
          data: { processed: true, processedAt: new Date() },
        });
        return res.status(200).json({ status: "ok" });
      }

      if (refundStatus === "failed") {
        // Just record the failed refund, no DB updates
        try {
          await prismaClient.refund.upsert({
            where: { razorpayRefundId },
            create: {
              paymentId: payment.id,
              razorpayRefundId,
              razorpayPaymentId: paymentId,
              amount: refundAmount,
              currency: payment.currency,
              status: "FAILED",
              speed: refundEntity.speed_requested || "normal",
            },
            update: { status: "FAILED" },
          });
        } catch (err) {
          logger.error("Failed to record failed refund:", err);
        }
        await prismaClient.webhookEventLog.update({
          where: { eventId },
          data: { processed: true, processedAt: new Date() },
        });
        return res.status(200).json({ status: "ok" });
      }

      // Refund created or processed ,  record it and update wallet
      const isProcessed = refundStatus === "processed" || event.event === "refund.processed";
      const newAmountRefunded = (payment.amountRefunded || 0) + refundAmount;
      const isFullRefund = newAmountRefunded >= payment.amount - 1;

      // Calculate proportional packages to deduct (only for ONE_TIME payments)
      let packagesToDeduct = 0;
      const isSubscriptionRefund = payment.paymentType === "SUBSCRIPTION";
      if (!isSubscriptionRefund) {
        const order = payment.order;
        if (order) {
          const totalOrderPackages = order.packageCount || order.plan?.package || 0;
          packagesToDeduct = payment.amount > 0
            ? Math.round((refundAmount / payment.amount) * totalOrderPackages)
            : 0;
        }
      }

      try {
        await withRetry(() =>
          prismaClient.$transaction(async (tx) => {
            // Check if this refund was already applied (avoids double deduction
            // when Razorpay emits both refund.created and refund.processed)
            const existingRefund = await tx.refund.findUnique({
              where: { razorpayRefundId },
              select: { id: true, status: true },
            });
            const alreadyApplied = existingRefund?.status === "PROCESSED";

            // Upsert refund record (idempotent)
            await tx.refund.upsert({
              where: { razorpayRefundId },
              create: {
                paymentId: payment.id,
                razorpayRefundId,
                razorpayPaymentId: paymentId,
                amount: refundAmount,
                currency: payment.currency,
                status: isProcessed ? "PROCESSED" : "PENDING",
                reason: refundEntity.notes?.reason || null,
                speed: refundEntity.speed_requested || "normal",
                processedAt: isProcessed ? new Date() : null,
              },
              update: {
                status: isProcessed ? "PROCESSED" : "PENDING",
                processedAt: isProcessed ? new Date() : undefined,
              },
            });

            // Update payment refund info
            await tx.payment.update({
              where: { id: payment.id },
              data: {
                amountRefunded: newAmountRefunded,
                refundStatus: isFullRefund ? "FULL" : "PARTIAL",
              },
            });

            // Deduct wallet packages proportionally (only for ONE_TIME payments, skip SUBSCRIPTION)
            if (!alreadyApplied && packagesToDeduct > 0) {
              const walletUserId = payment.userId || payment.order?.userId;
              if (!walletUserId) {
                logger.warn(`No userId found for payment ${paymentId}, skipping wallet deduction`);
              } else {
                await tx.userWallet.update({
                  where: { userId: walletUserId },
                  data: {
                    totalPackages: { decrement: packagesToDeduct },
                  },
                });

                await tx.userTransaction.create({
                  data: {
                    userId: walletUserId,
                    action: null,
                    package: packagesToDeduct,
                    transactionType: "REFUND",
                    status: "DEBIT",
                    paymentMethod: "PACKAGE",
                    razorpayPaymentId: paymentId,
                  },
                });
              }
            }
          })
        );
      } catch (err) {
        logger.error("Failed to process refund webhook transaction:", err);
      }

      await prismaClient.webhookEventLog.update({
        where: { eventId },
        data: { processed: true, processedAt: new Date() },
      });
      return res.status(200).json({ status: "processed" });
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
    const isAdmin = userDetail?.role?.isAdmin === true;

    const { paymentId, amount, reason } = req.body.payload || req.body;

    const payment = await prismaClient.payment.findUnique({
      where: { razorpayPaymentId: paymentId },
      include: { order: true },
    });

    if (!payment) {
      return sendError(res, 404, "Payment not found");
    }

    // Legacy subscription payments (handshake_subscription deprecated) are now
// treated as ordinary captured payments and can be refunded via this path.

    const refundUserId = payment.userId || payment.order?.userId;
    if (refundUserId !== userId && !isAdmin) {
      return sendError(res, 403, "Unauthorized");
    }

    // Check if payment is eligible for refund (must be captured)
    if (payment.status !== "CAPTURED") {
      return sendError(res, 400, "Payment is not eligible for refund");
    }

    // Check if already fully refunded
    if (payment.refundStatus === "FULL" || payment.amountRefunded >= payment.amount) {
      return sendError(res, 400, "Payment has already been fully refunded");
    }

    // Calculate refund amount
    const amountInPaise = amount ? Math.round(amount * 100) : undefined;
    const currentRefundAmount = amountInPaise !== undefined ? amountInPaise : (payment.amount - payment.amountRefunded);
    const newAmountRefunded = payment.amountRefunded + currentRefundAmount;

    if (currentRefundAmount <= 0) {
      return sendError(res, 400, "Refund amount must be greater than zero");
    }

    if (newAmountRefunded > payment.amount) {
      return sendError(res, 400, "Refund amount exceeds the remaining payment amount");
    }

    // Call Razorpay refund API
    const refundResult = await refundPayment(paymentId, currentRefundAmount, {
      reason: reason || "Customer requested refund",
    });

    const isFullRefund = newAmountRefunded >= payment.amount;

    // Calculate proportional packages to deduct
    let packagesToDeduct = 0;
    const refundOrder = payment.orderId
      ? await prismaClient.order.findUnique({
          where: { id: payment.orderId },
          include: { plan: true },
        })
      : null;
    if (refundOrder) {
      const totalOrderPackages = refundOrder.packageCount || refundOrder.plan?.package || 0;
      packagesToDeduct = payment.amount > 0
        ? Math.round((currentRefundAmount / payment.amount) * totalOrderPackages)
        : 0;
    }

    // Process all DB changes inside a prisma transaction
    const refund = await prismaClient.$transaction(async (tx) => {
      // 1. Create refund record in database
      const refundRecord = await tx.refund.create({
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

      // 2. Update payment record with refund info
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          amountRefunded: newAmountRefunded,
          refundStatus: isFullRefund ? "FULL" : "PARTIAL",
        },
      });

      // 3. Deduct packages from wallet proportionally
      if (packagesToDeduct > 0 && refundOrder) {
        const walletUserId = refundOrder.userId;
        await tx.userWallet.update({
          where: { userId: walletUserId },
          data: {
            totalPackages: { decrement: packagesToDeduct },
          },
        });

        // Create transaction record
        await tx.userTransaction.create({
          data: {
            userId: walletUserId,
            action: null,
            package: packagesToDeduct,
            transactionType: "REFUND",
            status: "DEBIT",
            paymentMethod: "PACKAGE",
            razorpayPaymentId: paymentId,
          },
        });
      }

      return refundRecord;
    });

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
  } catch (error: any) {
    console.error("Refund processing error:", error);
    return sendError(res, 500, error?.message || "Refund failed");
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
