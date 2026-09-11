import { type Request, type Response } from "express";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient } from "@/lib/prisma";
import {
  getRazorpayInstance,
  getRazorpayKeyId,
  isRazorpayConfigured,
  verifyWebhookSignature,
} from "@/lib/razorpay";
import { getSystemConfigNumber } from "@/lib/handshake";
import { v4 as uuidv4 } from "uuid";

/**
 * Spec §43: catalog of paid add-ons (Professional Tester, Priority Support, etc).
 */
export const getAddonCatalog = async (req: Request, res: Response) => {
  try {
    const items = await prismaClient.addOn.findMany({
      where: { isActive: true },
      orderBy: { priceINR: "asc" },
    });
    return sendSuccess(res, items, "ok");
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
};

interface PurchaseAddonBody {
  addOnId: number;
  campaignId: number;
}

/**
 * Initiate a one-time Razorpay purchase for an add-on.
 * v1 stub: fee recorded but no payout logic. Real payout is v2.
 */
export const purchaseAddon = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    if (!userId) return sendError(res, 401, "Unauthorized");

    const body: PurchaseAddonBody = req.body?.payload ?? req.body;
    const addOnId = parseInt(String(body?.addOnId || ""), 10);
    const campaignId = parseInt(String(body?.campaignId || ""), 10);
    if (!addOnId || !campaignId) {
      return sendError(res, 400, "addOnId and campaignId are required");
    }

    const addOn = await prismaClient.addOn.findUnique({ where: { id: addOnId } });
    if (!addOn || !addOn.isActive) {
      return sendError(res, 404, "AddOn not available");
    }

    const campaign = await prismaClient.dashboardAndHub.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) return sendError(res, 404, "Campaign not found");
    if (campaign.appOwnerId !== userId) {
      return sendError(res, 403, "Only the campaign owner can purchase add-ons");
    }

    // P4: config check BEFORE inserting — no orphan CREATED rows when
    // payments are unconfigured (catalog is preview-only).
    if (!isRazorpayConfigured()) {
      return sendError(
        res,
        503,
        "Payment system not configured. Add-on catalog is preview-only.",
      );
    }

    const purchase = await prismaClient.addOnPurchase.create({
      data: {
        userId,
        campaignId,
        addOnId,
        amountINR: addOn.priceINR,
        status: "CREATED",
      },
    });

    try {
      const razorpay = getRazorpayInstance();
      const order = await razorpay.orders.create({
        amount: addOn.priceINR * 100,
        currency: "INR",
        receipt: `addon_${purchase.id}_${uuidv4().slice(0, 8)}`,
        notes: {
          type: "ADDON_PURCHASE",
          purchaseId: String(purchase.id),
          addOnId: String(addOnId),
          campaignId: String(campaignId),
        },
      });

      await prismaClient.addOnPurchase.update({
        where: { id: purchase.id },
        data: { razorpayOrderId: order.id },
      });

      return sendSuccess(
        res,
        {
          purchaseId: purchase.id,
          razorpayOrderId: order.id,
          razorpayKeyId: getRazorpayKeyId(),
          amountINR: addOn.priceINR,
          addOnName: addOn.name,
        },
        "Order created",
      );
    } catch (rzpErr) {
      await prismaClient.addOnPurchase.update({
        where: { id: purchase.id },
        data: { status: "FAILED" },
      });
      throw rzpErr;
    }
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "addon",
      action: "purchaseAddon",
      targetId: String(req?.body?.payload?.addOnId || ""),
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
 * Razorpay payment.captured webhook → mark AddOnPurchase paid.
 * For PROFESSIONAL_TESTER add-ons, opens a ProfessionalTesterAssignment.
 */
export const handleAddonWebhook = async (req: Request, res: Response) => {
  try {
    // Verify Razorpay signature BEFORE trusting any payload (S4a-5: security fix)
    const rawBody = (req as any).rawBody
      ? (req as any).rawBody.toString()
      : JSON.stringify(req.body);
    const signature = req.headers["x-razorpay-signature"] as string;
    const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "";

    if (!RAZORPAY_WEBHOOK_SECRET) {
      return res.status(500).json({ error: "Webhook secret not configured" });
    }
    if (!signature) {
      return res.status(400).json({ error: "Missing signature" });
    }
    if (!verifyWebhookSignature(rawBody, signature, RAZORPAY_WEBHOOK_SECRET)) {
      return res.status(400).json({ error: "Invalid signature" });
    }

    const event = req.body;
    if (event?.event !== "payment.captured") {
      return res.status(200).json({ status: "ignored" });
    }
    const payment = event?.payload?.payment?.entity;
    if (!payment) return res.status(200).json({ status: "no_payment_entity" });

    const razorpayOrderId = payment.order_id;
    if (!razorpayOrderId) return res.status(200).json({ status: "no_order" });

    const purchase = await prismaClient.addOnPurchase.findUnique({
      where: { razorpayOrderId },
      include: { addOn: true },
    });
    if (!purchase) return res.status(200).json({ status: "unknown_order" });
    if (purchase.status === "PAID") {
      return res.status(200).json({ status: "already_paid" });
    }

    // P4: idempotency race fix — Razorpay retries the same webhook when we
    // respond slowly; a read-then-write here let two concurrent retries both
    // pass the PAID check and create duplicate ProfessionalTesterAssignment
    // rows. A single conditional updateMany makes exactly one retry win.
    const claim = await prismaClient.addOnPurchase.updateMany({
      where: { id: purchase.id, status: { not: "PAID" } },
      data: { status: "PAID", purchasedAt: new Date() },
    });
    if (claim.count === 0) {
      return res.status(200).json({ status: "already_paid" });
    }

    if (purchase.addOn.category === "PROFESSIONAL_TESTER") {
      await prismaClient.professionalTesterAssignment.create({
        data: {
          campaignId: purchase.campaignId,
          assignedByAdminId: purchase.userId,
          status: "OPEN",
          feeINR: purchase.amountINR,
          notes: `Auto-opened from AddOn purchase ${purchase.id}`,
        },
      });
    }

    return res.status(200).json({ status: "processed" });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("addon webhook error:", error);
    return res.status(500).json({ status: "error" });
  }
};

interface AssignProTesterBody {
  campaignId: number;
  feeINR?: number | null;
}

/**
 * Admin: open a professional tester assignment slot directly (no payment flow).
 * v1 stub: no payout logic.
 */
export const assignProfessionalTester = async (req: Request, res: Response) => {
  try {
    const adminId = req?.userId;
    if (!adminId) return sendError(res, 401, "Unauthorized");

    const body: AssignProTesterBody = req.body?.payload ?? req.body;
    const campaignId = parseInt(String(body?.campaignId || ""), 10);
    if (!campaignId) return sendError(res, 400, "campaignId is required");

    const fee =
      body?.feeINR !== undefined && body.feeINR !== null
        ? Math.max(0, parseInt(String(body.feeINR), 10))
        : await getSystemConfigNumber("professional_tester_fee_inr", 499);

    const created = await prismaClient.professionalTesterAssignment.create({
      data: {
        campaignId,
        assignedByAdminId: adminId,
        status: "OPEN",
        feeINR: fee,
      },
    });

    return sendSuccess(res, created, "Professional tester assignment opened");
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
};

interface FillProTesterBody {
  professionalUserId: string;
}

/**
 * Admin: fill an OPEN professional tester assignment with a specific user.
 *
 * Actually seats the tester: creates/reactivates their TesterRelation
 * (ADMIN_ASSIGNED, IN_PROGRESS), increments currentTester under a capacity
 * guard, and — when the fill completes the cohort — stamps the HANDSHAKE
 * 24h WAITING window and cancels stale pending requests (same block as the
 * normal accept path). Previously this only flipped the assignment row,
 * leaving the campaign stuck in WAITING_FOR_PARTNERS with zero relations.
 */
export const fillProfessionalTester = async (req: Request, res: Response) => {
  try {
    const adminId = req?.userId;
    if (!adminId) return sendError(res, 401, "Unauthorized");

    const id = parseInt(String(req?.params?.id || ""), 10);
    if (!id || isNaN(id)) return sendError(res, 400, "Assignment id is required");

    const body: FillProTesterBody = req.body?.payload ?? req.body;
    const professionalUserId = String(body?.professionalUserId || "");
    if (!professionalUserId) {
      return sendError(res, 400, "professionalUserId is required");
    }

    const assignment = await prismaClient.professionalTesterAssignment.findUnique({
      where: { id },
    });
    if (!assignment) return sendError(res, 404, "Assignment not found");
    if (assignment.status !== "OPEN") {
      return sendError(
        res,
        400,
        `Cannot fill assignment in status ${assignment.status}`,
      );
    }

    const campaign = await prismaClient.dashboardAndHub.findUnique({
      where: { id: assignment.campaignId },
      select: {
        id: true,
        appType: true,
        status: true,
        currentTester: true,
        totalTester: true,
      },
    });
    if (!campaign) return sendError(res, 404, "Campaign not found");

    const { upsertTesterRelation, cancelPendingRequestsForCampaign } =
      await import("@/lib/handshake");
    const now = new Date();

    const updated = await prismaClient.$transaction(async (tx) => {
      // Seat the tester (throws __ALREADY_PARTICIPATING__ when already in,
      // surfacing as 409 below).
      await upsertTesterRelation(tx, {
        testerId: professionalUserId,
        hubId: campaign.id,
        reactivateStatus: "IN_PROGRESS",
        assignmentSource: "ADMIN_ASSIGNED",
      });

      // Atomic capacity-guarded increment (409 when the slot filled first).
      const incResult = await tx.dashboardAndHub.updateMany({
        where: {
          id: campaign.id,
          currentTester: { lt: campaign.totalTester },
        },
        data: { currentTester: { increment: 1 } },
      });
      if (incResult.count === 0) {
        throw new Error("__SLOT_FULL__");
      }

      const filled = await tx.professionalTesterAssignment.update({
        where: { id, status: "OPEN" },
        data: {
          professionalUserId,
          status: "FILLED",
          filledAt: now,
        },
      });

      // If this fill completed the cohort, stamp the waiting/active window
      // (mirrors the normal accept path).
      const fresh = await tx.dashboardAndHub.findUnique({
        where: { id: campaign.id },
        select: {
          currentTester: true,
          totalTester: true,
          status: true,
          waitingPeriodStartedAt: true,
          testingStartEligibleAt: true,
        },
      });
      if (
        fresh &&
        fresh.currentTester >= fresh.totalTester &&
        (fresh.status === "AVAILABLE" ||
          fresh.status === "FINDING_TESTERS" ||
          fresh.status === "WAITING_FOR_PARTNERS")
      ) {
        if (campaign.appType === "HANDSHAKE") {
          // Pro-fill can seat the last tester into an already-WAITING
          // campaign (admin Replace freed a slot, status not rolled back).
          // Re-stamp the waiting window from now and cancel stale pending
          // requests unconditionally so the new cohort starts clean.
          await tx.dashboardAndHub.updateMany({
            where: {
              id: campaign.id,
              status: { in: ["AVAILABLE", "FINDING_TESTERS", "WAITING_FOR_PARTNERS"] },
            },
            data: {
              status: "WAITING_FOR_PARTNERS",
              waitingPeriodStartedAt: now,
              testingStartEligibleAt: new Date(
                now.getTime() + 24 * 60 * 60 * 1000,
              ),
            },
          });
          await cancelPendingRequestsForCampaign(tx, campaign.id, now);
        } else {
          const totalDay =
            (
              await tx.dashboardAndHub.findUnique({
                where: { id: campaign.id },
                select: { totalDay: true },
              })
            )?.totalDay || 14;
          // FREE/PAID never sit in WAITING_FOR_PARTNERS, but guard the
          // status allow-list defensively.
          await tx.dashboardAndHub.updateMany({
            where: {
              id: campaign.id,
              status: { in: ["AVAILABLE", "FINDING_TESTERS"] },
            },
            data: {
              status: "IN_TESTING",
              testingStartDate: now,
              testingEndDate: new Date(
                now.getTime() + totalDay * 24 * 60 * 60 * 1000,
              ),
            },
          });
        }
      }

      return filled;
    });

    return sendSuccess(res, updated, "Professional tester assigned");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (
      message === "__ALREADY_PARTICIPATING__" ||
      message === "__SLOT_FULL__"
    ) {
      return sendError(res, 409, message);
    }
    return sendError(res, 400, message);
  }
};

/**
 * Admin: cancel an open assignment.
 */
export const cancelProfessionalTester = async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req?.params?.id || ""), 10);
    if (!id || isNaN(id)) return sendError(res, 400, "Assignment id is required");

    const updated = await prismaClient.professionalTesterAssignment.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    return sendSuccess(res, updated, "Professional tester assignment cancelled");
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
};

/**
 * Admin: list professional tester assignments.
 */
export const listProfessionalAssignments = async (req: Request, res: Response) => {
  try {
    const campaignId = req?.query?.campaignId
      ? parseInt(String(req.query.campaignId), 10)
      : undefined;
    const status = req?.query?.status ? String(req.query.status) : undefined;

    const where: any = {};
    if (campaignId) where.campaignId = campaignId;
    if (status) where.status = status;

    const items = await prismaClient.professionalTesterAssignment.findMany({
      where,
      orderBy: { assignedAt: "desc" },
      include: {
        campaign: {
          select: {
            id: true,
            status: true,
            appOwnerId: true,
            androidApp: { select: { appName: true, appLogoUrl: true } },
          },
        },
      },
    });

    return sendSuccess(res, { items }, "ok");
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
};
