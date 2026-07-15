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

    return sendSuccess(res, { status: mappedStatus });
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
  } catch (error) {
    logger.error("processSubscriptionWebhook error:", error);
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
