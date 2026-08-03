import logger from "../utils/logger";
import { type Request, type Response } from "express";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient, Prisma } from "@/lib/prisma";
import {
  getRazorpayInstance,
  getRazorpayKeyId,
  isRazorpayConfigured,
  type RazorpaySubscriptionWebhookEvent,
} from "@/lib/razorpay";
import {
  getNextInvoiceNumber,
  calculateTax,
  determineInvoiceType,
  amountToWords,
  formatPeriod,
  getStateCodeFromName,
  COMPANY_DETAILS,
} from "@/utils/invoice.utils";

const RAZORPAY_HANDSHAKE_PLAN_ID = process.env.RAZORPAY_HANDSHAKE_PLAN_ID;

const SUBSCRIPTION_CYCLES = 1200; // 100 years at monthly - effectively indefinite auto-renewal

const HANDSHAKE_PLAN_AMOUNT = 9900; // ₹99 in paise

/**
 * Resolve the subscription amount (in paise) for handshake plans.
 * Prefers the value stored on the SUBSCRIPTION plan row in the DB; falls
 * back to the HANDSHAKE_PLAN_AMOUNT constant if no DB plan is found.
 */
async function getHandshakePlanAmount(): Promise<number> {
  try {
    const plan = await prismaClient.plans.findFirst({
      where: { billingType: "SUBSCRIPTION", isActive: true },
      orderBy: { createdAt: "desc" },
    });
    if (plan && typeof plan.price === "number") {
      return Math.round(plan.price * 100);
    }
  } catch {
    // ignore and fall back to constant
  }
  return HANDSHAKE_PLAN_AMOUNT;
}

/**
 * Resolve the Razorpay plan used for handshake subscriptions.
 * Uses the configured plan id if present and valid, otherwise looks up an
 * existing monthly plan (amount resolved from the DB), and creates one on the
 * fly if none exists. This removes the need to pre-create the plan manually.
 */
async function resolveHandshakePlan(razorpay: any): Promise<string> {
  const amount = await getHandshakePlanAmount();

  if (RAZORPAY_HANDSHAKE_PLAN_ID) {
    try {
      await razorpay.plans.fetch(RAZORPAY_HANDSHAKE_PLAN_ID);
      return RAZORPAY_HANDSHAKE_PLAN_ID;
    } catch {
      // configured id invalid - fall through to auto-resolve
    }
  }

  try {
    const plans = await razorpay.plans.all({ count: 100 });
    const existing = (plans.items || []).find(
      (p: any) => p.item?.amount === amount && p.period === "monthly",
    );
    if (existing) return existing.id;
  } catch {
    // ignore and create a new plan
  }

  const created = await razorpay.plans.create({
    period: "monthly",
    interval: 1,
    item: {
      name: "Handshake Testing Subscription",
      description: "Monthly access to Handshake Testing on inTesters",
      amount,
      currency: "INR",
    },
  });
  return created.id;
}

/**
 * Public endpoint returning the handshake subscription plan (price, features,
 * billing type) sourced from the database.
 */
export const getHandshakePlan = async (req: Request, res: Response) => {
  try {
    const plan = await prismaClient.plans.findFirst({
      where: { billingType: "SUBSCRIPTION", isActive: true },
      orderBy: { createdAt: "desc" },
    });
    if (!plan) {
      return sendSuccess(res, { plan: null }, "No handshake plan configured");
    }
    return sendSuccess(
      res,
      {
        plan: {
          ...plan,
          features: JSON.parse(JSON.stringify(plan.features)),
          createdAt: plan.createdAt?.toString(),
          updatedAt: plan.updatedAt,
        },
      },
      "ok",
    );
  } catch (error) {
    logger.error("getHandshakePlan error:", error);
    return sendError(res, 500, "Failed to fetch handshake plan");
  }
};

/**
 * Check if a user currently has an active handshake subscription.
 * Status ACTIVE or AUTHENTICATED (first cycle before activation) counts as active.
 */
export const hasActiveHandshakeSubscription = async (
  userId: string,
): Promise<boolean> => {
  const sub = await prismaClient.handshakeSubscription.findFirst({
    where: {
      userId,
      status: { in: ["ACTIVE", "AUTHENTICATED"] },
    },
    orderBy: { createdAt: "desc" },
  });
  return !!sub;
};

/**
 * Create a new handshake subscription.
 * Creates a Razorpay subscription linked to the configured plan and returns
 * the authorization URL the user must visit to complete the mandate setup.
 */
export const createHandshakeSubscription = async (
  req: Request,
  res: Response,
) => {
  try {
    const userId = req?.userId;
    if (!userId) {
      return sendError(res, 401, "Unauthorized");
    }

    if (!isRazorpayConfigured()) {
      return sendError(res, 503, "Payment service is not configured");
    }

    // Only a genuinely active subscription blocks a new one. A CREATED
    // subscription may be an abandoned/expired checkout, so don't reuse it.
    const existing = await prismaClient.handshakeSubscription.findFirst({
      where: {
        userId,
        status: { in: ["ACTIVE", "AUTHENTICATED"] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      return sendSuccess(res, {
        subscriptionId: existing.razorpaySubscriptionId,
        status: existing.status,
        message: "You already have an active subscription",
      });
    }

    // Clean up any stale (created/pending/halted) subscription so we don't
    // hand the frontend an expired Razorpay subscription to authorize.
    const stale = await prismaClient.handshakeSubscription.findFirst({
      where: {
        userId,
        status: { in: ["CREATED", "PENDING", "HALTED"] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (stale) {
      if (isRazorpayConfigured()) {
        try {
          const razorpay = getRazorpayInstance();
          await razorpay.subscriptions.cancel(stale.razorpaySubscriptionId, false);
        } catch (e) {
          logger.warn("Razorpay cancel failed for stale subscription:", e);
        }
      }
      await prismaClient.handshakeSubscription.update({
        where: { id: stale.id },
        data: { status: "CANCELLED" },
      });
    }

    // Verify billing info exists (needed for invoices/communication)
    const billingInfo = await prismaClient.billingInfo.findUnique({
      where: { userId },
    });
    if (!billingInfo || !billingInfo.phone) {
      return sendError(
        res,
        403,
        "Please fill your billing information before subscribing",
        undefined,
        undefined,
        { billingInfoMissing: true },
      );
    }

    const razorpay = getRazorpayInstance();
    const planId = await resolveHandshakePlan(razorpay);
    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      total_count: SUBSCRIPTION_CYCLES,
      customer_notify: true,
      notes: {
        userId: userId,
        purpose: "handshake_testing",
      },
    });

    const created = await prismaClient.handshakeSubscription.create({
      data: {
        userId,
        razorpaySubscriptionId: subscription.id,
        razorpayPlanId: subscription.plan_id,
        status: "CREATED",
        totalCycles: subscription.total_count,
        currentPeriodStart: subscription.start_at
          ? new Date(subscription.start_at * 1000)
          : null,
        currentPeriodEnd: subscription.end_at
          ? new Date(subscription.end_at * 1000)
          : null,
      },
    });

    return sendSuccess(res, {
      subscriptionId: created.razorpaySubscriptionId,
      status: created.status,
      razorpayKeyId: getRazorpayKeyId(),
      authorizationUrl: subscription.short_url,
    });
  } catch (error) {
    logger.error("createHandshakeSubscription error:", error);
    return sendError(res, 500, "Failed to create subscription");
  }
};

/**
 * Get the current user's latest handshake subscription.
 */
export const getMySubscription = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    if (!userId) {
      return sendError(res, 401, "Unauthorized");
    }

    const sub = await prismaClient.handshakeSubscription.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    if (!sub) {
      return sendSuccess(res, { subscription: null });
    }

    // Sync with Razorpay if possible so frontend always sees fresh status
    if (isRazorpayConfigured() && sub.razorpaySubscriptionId) {
      try {
        const razorpay = getRazorpayInstance();
        const remote: any = await razorpay.subscriptions.fetch(sub.razorpaySubscriptionId);
        const mappedStatus = remote.status.toUpperCase() as
          | "ACTIVE" | "AUTHENTICATED" | "CANCELLED" | "HALTED"
          | "PENDING" | "COMPLETED" | "EXPIRED" | "CREATED";

        // Only update if status actually changed (avoids unnecessary writes)
        if (mappedStatus && (mappedStatus !== sub.status || remote.paid_count !== sub.paidCount)) {
          await prismaClient.handshakeSubscription.update({
            where: { id: sub.id },
            data: {
              status: mappedStatus,
              paidCount: remote.paid_count ?? sub.paidCount,
              currentPeriodStart: remote.current_start
                ? new Date(remote.current_start * 1000)
                : sub.currentPeriodStart,
              currentPeriodEnd: remote.current_end
                ? new Date(remote.current_end * 1000)
                : sub.currentPeriodEnd,
            },
          });
          sub.status = mappedStatus;
          sub.paidCount = remote.paid_count ?? sub.paidCount;
          sub.currentPeriodStart = remote.current_start
            ? new Date(remote.current_start * 1000)
            : sub.currentPeriodStart;
          sub.currentPeriodEnd = remote.current_end
            ? new Date(remote.current_end * 1000)
            : sub.currentPeriodEnd;
        }
      } catch (e) {
        logger.warn("getMySubscription: Razorpay sync failed, returning local data:", e);
      }
    }

    return sendSuccess(res, {
      subscription: {
        id: sub.razorpaySubscriptionId,
        status: sub.status,
        currentPeriodStart: sub.currentPeriodStart,
        currentPeriodEnd: sub.currentPeriodEnd,
        paidCount: sub.paidCount,
        isActive: sub.status === "ACTIVE" || sub.status === "AUTHENTICATED",
      },
    });
  } catch (error) {
    logger.error("getMySubscription error:", error);
    return sendError(res, 500, "Failed to fetch subscription");
  }
};

/**
 * Cancel the current user's handshake subscription.
 */
export const cancelHandshakeSubscription = async (
  req: Request,
  res: Response,
) => {
  try {
    const userId = req?.userId;
    if (!userId) {
      return sendError(res, 401, "Unauthorized");
    }

    const sub = await prismaClient.handshakeSubscription.findFirst({
      where: {
        userId,
        status: { in: ["ACTIVE", "AUTHENTICATED", "PENDING", "CREATED"] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!sub) {
      return sendError(res, 404, "No active subscription found");
    }

    if (isRazorpayConfigured()) {
      try {
        const razorpay = getRazorpayInstance();
        await razorpay.subscriptions.cancel(sub.razorpaySubscriptionId, false);
      } catch (razorpayError) {
        logger.warn("Razorpay cancel failed:", razorpayError);
      }
    }

    await prismaClient.handshakeSubscription.update({
      where: { id: sub.id },
      data: { status: "CANCELLED" },
    });

    return sendSuccess(res, { status: "CANCELLED" });
  } catch (error) {
    logger.error("cancelHandshakeSubscription error:", error);
    return sendError(res, 500, "Failed to cancel subscription");
  }
};

/**
 * Sync subscription status from Razorpay.
 */
export const getSubscriptionStatus = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    if (!userId) {
      return sendError(res, 401, "Unauthorized");
    }

    const { id } = req.params;
    if (!id) {
      return sendError(res, 400, "Subscription ID is required");
    }
    const subscriptionId = String(id);

    const sub = await prismaClient.handshakeSubscription.findFirst({
      where: { userId, razorpaySubscriptionId: subscriptionId },
    });
    if (!sub) {
      return sendError(res, 404, "Subscription not found");
    }

    if (!isRazorpayConfigured()) {
      return sendSuccess(res, { status: sub.status });
    }

    const razorpay = getRazorpayInstance();
    const remote: any = await razorpay.subscriptions.fetch(subscriptionId);

    const mappedStatus = remote.status.toUpperCase() as
      | "ACTIVE"
      | "AUTHENTICATED"
      | "CANCELLED"
      | "HALTED"
      | "PENDING"
      | "COMPLETED"
      | "EXPIRED"
      | "CREATED";

    await prismaClient.handshakeSubscription.update({
      where: { id: sub.id },
      data: {
        status: mappedStatus,
        paidCount: remote.paid_count,
        currentPeriodStart: remote.current_start
          ? new Date(remote.current_start * 1000)
          : sub.currentPeriodStart,
        currentPeriodEnd: remote.current_end
          ? new Date(remote.current_end * 1000)
          : sub.currentPeriodEnd,
      },
    });

    // Fetch latest payment + invoice for this subscription
    const latestPayment = await prismaClient.payment.findFirst({
      where: { handshakeSubscriptionId: sub.id, status: "CAPTURED" },
      orderBy: { createdAt: "desc" },
      include: { invoice: { select: { invoice_number: true } } },
    });

    return sendSuccess(res, {
      status: mappedStatus,
      paidCount: remote.paid_count ?? sub.paidCount,
      currentPeriodStart: remote.current_start
        ? new Date(remote.current_start * 1000).toISOString()
        : sub.currentPeriodStart?.toISOString() || null,
      currentPeriodEnd: remote.current_end
        ? new Date(remote.current_end * 1000).toISOString()
        : sub.currentPeriodEnd?.toISOString() || null,
      latestPayment: latestPayment
        ? {
            id: latestPayment.id,
            amount: latestPayment.amount,
            currency: latestPayment.currency,
            method: latestPayment.method,
            razorpayPaymentId: latestPayment.razorpayPaymentId,
            createdAt: latestPayment.createdAt.toISOString(),
          }
        : null,
      latestInvoice: latestPayment?.invoice
        ? { invoice_number: latestPayment.invoice.invoice_number }
        : null,
    });
  } catch (error) {
    logger.error("getSubscriptionStatus error:", error);
    return sendError(res, 500, "Failed to fetch subscription status");
  }
};

/**
 * Process Razorpay subscription webhook events.
 * Called from billing.controller handleWebhook for subscription.* events.
 */
export const processSubscriptionWebhook = async (
  event: RazorpaySubscriptionWebhookEvent,
): Promise<void> => {
  try {
    const subEntity = event.payload.subscription?.entity;
    if (!subEntity?.id) {
      return;
    }

    const subscriptionId = String(subEntity.id);
    const mappedStatus = (subEntity.status ?? "").toUpperCase() as
      | "ACTIVE"
      | "AUTHENTICATED"
      | "CANCELLED"
      | "HALTED"
      | "PENDING"
      | "COMPLETED"
      | "EXPIRED"
      | "CREATED"
      | "";

    if (!mappedStatus) return;

    const existing = await prismaClient.handshakeSubscription.findUnique({
      where: { razorpaySubscriptionId: subscriptionId },
    });

    if (!existing) {
      logger.warn(
        `Subscription webhook for unknown subscription: ${subscriptionId}`,
      );
      return;
    }

    // Always update subscription status
    await prismaClient.handshakeSubscription.update({
      where: { razorpaySubscriptionId: subscriptionId },
      data: {
        status: mappedStatus,
        paidCount: subEntity.paid_count ?? existing.paidCount,
        currentPeriodStart: subEntity.current_start
          ? new Date(subEntity.current_start * 1000)
          : existing.currentPeriodStart,
        currentPeriodEnd: subEntity.current_end
          ? new Date(subEntity.current_end * 1000)
          : existing.currentPeriodEnd,
      },
    });

    logger.info(
      `Handshake subscription ${subscriptionId} status -> ${mappedStatus}`,
    );

    // Handle subscription.charged — create Payment + Invoice record
    if (event.event === "subscription.charged") {
      const paymentEntity = event.payload.payment?.entity;
      if (!paymentEntity) {
        logger.warn(`subscription.charged event missing payment entity for ${subscriptionId}`);
        return;
      }

      try {
        await prismaClient.$transaction(async (tx) => {
          // Idempotent: if payment already exists, skip
          const paymentExists = await tx.payment.findUnique({
            where: { razorpayPaymentId: paymentEntity.id },
            select: { id: true },
          });
          if (paymentExists) {
            logger.info(`Payment ${paymentEntity.id} already recorded for subscription ${subscriptionId}`);
            return;
          }

          const transactionDate = new Date();
          const userId = existing.userId;

          // Determine invoice type from billing info
          const billingInfo = await tx.billingInfo.findUnique({ where: { userId } });
          const customerCountry = billingInfo?.country || "India";
          const customerState = billingInfo?.state || null;
          const customerStateCode = billingInfo?.stateCode || (customerCountry === "India"
            ? getStateCodeFromName(customerState) : null);
          const invoiceType = determineInvoiceType(customerCountry);
          const invoiceNumber = await getNextInvoiceNumber(invoiceType, tx, transactionDate);
          const totalPaid = paymentEntity.amount;
          const currency = paymentEntity.currency || "INR";
          const quantity = 1;
          const unitPrice = totalPaid;
          const taxPreview = calculateTax(totalPaid, invoiceType, customerState, customerStateCode);
          const divisor = (100 + taxPreview.taxRate) / 100;
          const baseAmount = invoiceType === "EXP" ? totalPaid : Math.round(totalPaid / divisor);
          const taxInfo = calculateTax(baseAmount, invoiceType, customerState, customerStateCode);
          const computedTotal = baseAmount + taxInfo.cgstAmount + taxInfo.sgstAmount + taxInfo.igstAmount;
          const roundingDiff = totalPaid - computedTotal;
          if (roundingDiff !== 0) {
            if (taxInfo.igstAmount > 0) {
              taxInfo.igstAmount += roundingDiff;
            } else {
              taxInfo.sgstAmount += roundingDiff;
            }
          }

          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 30);

          // Create Payment record
          const paymentRecord = await tx.payment.create({
            data: {
              razorpayPaymentId: paymentEntity.id,
              razorpayOrderId: paymentEntity.order_id || `sub_${subscriptionId}`,
              amount: totalPaid,
              currency,
              status: "CAPTURED",
              method: paymentEntity.method,
              email: paymentEntity.email,
              contact: paymentEntity.contact,
              fee: paymentEntity.fee || 0,
              tax: paymentEntity.tax || 0,
              captured: true,
              userId,
              customer_name: billingInfo?.name || null,
              customer_email: billingInfo?.email || paymentEntity.email || null,
              paymentType: "SUBSCRIPTION",
              handshakeSubscriptionId: existing.id,
            },
          });

          // Create Invoice
          await tx.invoice.create({
            data: {
              paymentId: paymentRecord.id,
              userId,
              invoice_number: invoiceNumber,
              invoice_type: invoiceType,
              service_name: "Handshake Testing Subscription",
              sac_code: COMPANY_DETAILS.sacCode,
              period: formatPeriod(transactionDate),
              quantity,
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
        });
      } catch (paymentErr) {
        logger.error(`Failed to record payment for subscription ${subscriptionId}:`, paymentErr);
      }
    }
  } catch (error) {
    logger.error("processSubscriptionWebhook error:", error);
  }
};

/**
 * Sync subscription payments from Razorpay API into local Payment + Invoice
 * records. Useful when webhooks haven't fired (dev environment) or as a manual
 * catch-up mechanism.
 */
export const syncSubscriptionPayments = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    if (!userId) {
      return sendError(res, 401, "Unauthorized");
    }

    const sub = await prismaClient.handshakeSubscription.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    if (!sub || !sub.razorpaySubscriptionId) {
      return sendError(res, 404, "No subscription found");
    }

    if (!isRazorpayConfigured()) {
      return sendError(res, 503, "Payment service is not configured");
    }

    const razorpay = getRazorpayInstance();

    // Fetch subscription payment history from Razorpay
    const remotePayments: any = await razorpay.payments.all({
      subscription_id: sub.razorpaySubscriptionId,
    } as any);

    const items: any[] = remotePayments?.items || [];
    let synced = 0;

    for (const paymentEntity of items) {
      if (paymentEntity.status !== "captured") continue;

      // Upsert is idempotent on razorpayPaymentId
      const existing = await prismaClient.payment.findUnique({
        where: { razorpayPaymentId: paymentEntity.id },
        select: { id: true },
      });
      if (existing) continue;

      const transactionDate = new Date(paymentEntity.created_at * 1000);
      const billingInfo = await prismaClient.billingInfo.findUnique({ where: { userId } });
      const customerCountry = billingInfo?.country || "India";
      const customerState = billingInfo?.state || null;
      const customerStateCode = billingInfo?.stateCode || (customerCountry === "India"
        ? getStateCodeFromName(customerState) : null);
      const invoiceType = determineInvoiceType(customerCountry);
      const invoiceNumber = await getNextInvoiceNumber(invoiceType, prismaClient, transactionDate);
      const totalPaid = paymentEntity.amount;
      const currency = paymentEntity.currency || "INR";
      const quantity = 1;
      const unitPrice = totalPaid;
      const taxPreview = calculateTax(totalPaid, invoiceType, customerState, customerStateCode);
      const divisor = (100 + taxPreview.taxRate) / 100;
      const baseAmount = invoiceType === "EXP" ? totalPaid : Math.round(totalPaid / divisor);
      const taxInfo = calculateTax(baseAmount, invoiceType, customerState, customerStateCode);
      const computedTotal = baseAmount + taxInfo.cgstAmount + taxInfo.sgstAmount + taxInfo.igstAmount;
      const roundingDiff = totalPaid - computedTotal;
      if (roundingDiff !== 0) {
        if (taxInfo.igstAmount > 0) {
          taxInfo.igstAmount += roundingDiff;
        } else {
          taxInfo.sgstAmount += roundingDiff;
        }
      }
      const dueDate = new Date(transactionDate);
      dueDate.setDate(dueDate.getDate() + 30);

      await prismaClient.$transaction(async (tx) => {
        const p = await tx.payment.create({
          data: {
            razorpayPaymentId: paymentEntity.id,
            razorpayOrderId: paymentEntity.order_id || `sub_${sub.razorpaySubscriptionId}`,
            amount: totalPaid,
            currency,
            status: "CAPTURED",
            method: paymentEntity.method,
            email: paymentEntity.email,
            contact: paymentEntity.contact,
            fee: paymentEntity.fee || 0,
            tax: paymentEntity.tax || 0,
            captured: true,
            userId,
            customer_name: billingInfo?.name || null,
            customer_email: billingInfo?.email || paymentEntity.email || null,
            paymentType: "SUBSCRIPTION",
            handshakeSubscriptionId: sub.id,
          },
        });

        await tx.invoice.create({
          data: {
            paymentId: p.id,
            userId,
            invoice_number: invoiceNumber,
            invoice_type: invoiceType,
            service_name: "Handshake Testing Subscription",
            sac_code: COMPANY_DETAILS.sacCode,
            period: formatPeriod(transactionDate),
            quantity,
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
      });

      synced++;
    }

    return sendSuccess(res, { synced }, `Synced ${synced} payments`);
  } catch (error) {
    logger.error("syncSubscriptionPayments error:", error);
    return sendError(res, 500, "Failed to sync subscription payments");
  }
};

const isAdmin = (req: Request): boolean =>
  req?.role === "ADMIN" || req?.role === "super_admin";

/**
 * Admin: list all handshake subscriptions with user info and pagination.
 */
export const listHandshakeSubscriptionsAdmin = async (
  req: Request,
  res: Response,
) => {
  try {
    if (!isAdmin(req)) {
      return sendError(res, 403, "Forbidden");
    }

    const page = Math.max(1, parseInt(String(req?.query?.page || "1")));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req?.query?.limit || "20"))),
    );
    const status = req?.query?.status
      ? String(req?.query?.status)
      : undefined;

    const where: any = {};
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      prismaClient.handshakeSubscription.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
          payments: {
            select: {
              id: true,
              amountRefunded: true,
              invoice: {
                select: { id: true, invoice_number: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prismaClient.handshakeSubscription.count({ where }),
    ]);

    return sendSuccess(res, { items, total, page, limit });
  } catch (error) {
    logger.error("listHandshakeSubscriptionsAdmin error:", error);
    return sendError(res, 500, "Failed to fetch subscriptions");
  }
};

/**
 * Admin: cancel a user's handshake subscription by its Razorpay id.
 */
export const cancelHandshakeSubscriptionAdmin = async (
  req: Request,
  res: Response,
) => {
  try {
    if (!isAdmin(req)) {
      return sendError(res, 403, "Forbidden");
    }

    const id = String(req?.params?.id);
    const sub = await prismaClient.handshakeSubscription.findFirst({
      where: { razorpaySubscriptionId: id },
    });
    if (!sub) {
      return sendError(res, 404, "Subscription not found");
    }

    if (isRazorpayConfigured()) {
      try {
        const razorpay = getRazorpayInstance();
        await razorpay.subscriptions.cancel(id, true);
      } catch (e) {
        logger.warn("Razorpay cancel failed for admin cancel:", e);
      }
    }

    await prismaClient.handshakeSubscription.update({
      where: { id: sub.id },
      data: { status: "CANCELLED" },
    });

    return sendSuccess(res, { ok: true });
  } catch (error) {
    logger.error("cancelHandshakeSubscriptionAdmin error:", error);
    return sendError(res, 500, "Failed to cancel subscription");
  }
};
