import { type Request, type Response } from "express";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient } from "@/lib/prisma";
import { type DashboardAndHubStatus, type UserDetail } from "@prisma/client";
import DeviceDetector from "device-detector-js";
import geoip from "geoip-lite";
import { auth } from "@/lib/auth";
import { fromNodeHeaders } from "better-auth/node";
import { isRazorpayConfigured, getRazorpayInstance } from "@/lib/razorpay";
import { verifyPassword } from "@/utils/passwordUtils";
import logger from "@/utils/logger";

function getLocation(ip: string | null) {
  if (!ip) return { city: "Unknown", region: "Unknown", country: "Unknown" };

  const geo = geoip.lookup(ip);
  if (!geo) return { city: "Unknown", region: "Unknown", country: "Unknown" };

  return {
    city: geo.city || "Unknown",
    region: geo.region || "Unknown",
    country: geo.country || "Unknown",
  };
}

function parseDeviceInfo(userAgent: string | null) {
  if (!userAgent)
    return { browser: "Unknown", os: "Unknown", device: "Unknown" };

  const dd = new DeviceDetector();
  const result = dd.parse(userAgent);

  return {
    deviceType: result.device?.type,
    deviceBrand: result.device?.brand || "",
    deviceModel: result.device?.model || "",
    browser: result.client?.name || "",
    browserVersion: result.client?.version || "",
    os: result.os?.name || "",
    osVersion: result.os?.version || "",
  };
}

export const getUserData = async (req: Request, res: Response) => {
  try {
    const response = await prismaClient?.user?.findFirst({
      where: {
        id: req?.userId,
      },
    });
    if (!response) {
      return sendError(res, 404, "User not found");
    }
    const responseData = {
      ...response,
      createdAt: response?.createdAt?.toISOString(),
      updatedAt: response?.updatedAt?.toISOString(),
    };
    return sendSuccess(res, responseData, "ok");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "user",
      action: "getUserData",
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

export const saveUserData = async (req: Request, res: Response) => {
  try {
    const response = await prismaClient?.user?.findFirst({
      where: {
        id: req?.userId,
      },
    });
    if (!response) {
      return sendError(res, 404, "User not found");
    }

    const { payload } = await req.body;

    const { first_name, last_name, phone, country, image } = payload;

    // return sendSuccess(res, responseData, "ok");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "user",
      action: "getUserData",
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

export const getUserProfileData = async (req: Request, res: Response) => {
  try {
    const response = await prismaClient?.userDetail?.findFirst({
      where: {
        userId: req?.userId,
      },
    });
    if (!response) {
      return sendError(res, 404, "User not found");
    }
    const responseData = {
      ...response,
      createdAt: response?.createdAt?.toISOString(),
      updatedAt: response?.updatedAt?.toISOString(),
    };
    return sendSuccess(res, responseData, "ok");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "user",
      action: "getUserProfileData",
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

export const saveProfileData = async (req: Request, res: Response) => {
  try {
    const { payload }: { payload: UserDetail } = await req.body;

    const {
      phone,
      country,
      profile_type,
      job_role,
      company_name,
      company_size,
      position_in_company,
      company_website,
      experience_level,
      total_published_apps,
      platform_development,
      publish_frequency,
      service_usage,
      communication_methods,
      notification_preference,
      device_company,
      device_model,
      ram,
      os,
      screen_resolution,
      language,
      network,
      years_of_experience,
      areas_of_expertise,
      bio,
    } = payload;

    await prismaClient?.userDetail?.update({
      where: {
        userId: req?.userId,
      },
      data: {
        phone,
        country,
        profile_type,
        job_role,
        company_name,
        company_size,
        position_in_company,
        company_website,
        experience_level,
        total_published_apps,
        platform_development,
        publish_frequency,
        service_usage,
        communication_methods,
        notification_preference,
        device_company,
        device_model,
        ram,
        os,
        screen_resolution,
        language,
        network,
        years_of_experience,
        areas_of_expertise,
        bio,
        initial: false,
      },
    });

    const checkAllValues = await prismaClient?.userDetail?.findFirst({
      where: {
        userId: req?.userId,
      },
    });

    return sendSuccess(
      res,
      { success: true, profileData: checkAllValues },
      "User profile data saved successfully",
    );
  } catch (error: any) {
    if (
      (error.code === "P2002" && error?.meta?.target?.includes("phone")) ||
      (error?.message?.includes("Unique constraint failed") &&
        error?.message?.includes("phone"))
    ) {
      return sendError(res, 400, "This phone number is already in use.");
    }
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "user",
      action: "saveProfileDate",
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

export const getNotifications = async (req: Request, res: Response) => {
  try {
    const response = await prismaClient?.userDetail?.findFirst({
      where: {
        userId: req?.userId,
      },
    });
    if (!response) {
      return sendError(res, 404, "User not found");
    }

    const role = req.role;
    const isAdmin = req.isAdmin === true;

    const where: any = {
      OR: [
        { userId: req?.userId },
      ],
      isActive: true,
    };

    if (isAdmin) {
      where.OR.push({ userId: null });
    } else {
      where.OR.push({ userId: null, isAdminOnly: false });
    }

    const result = await prismaClient?.notification?.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
    });

    const totalNotifications = await prismaClient?.notification?.count({
      where,
    });

    return sendSuccess(
      res,
      { notifications: result, totalNotifications },
      "ok",
    );
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "user",
      action: "getNotifications",
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

export const getAllPricingPlans = async (req: Request, res: Response) => {
  try {
    const plans = await prismaClient?.plans?.findMany({
      where: {
        isActive: true,
      },
      orderBy: [{ sequence: "asc" }, { price: "asc" }],
    });
    const responseData = plans.map((item) => {
      return {
        ...item,
        features: JSON.parse(JSON.stringify(item?.features)),
        createdAt: item?.createdAt?.toString(),
        updatedAt: item?.updatedAt,
      };
    });

    return sendSuccess(res, responseData, "ok");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "user",
      action: "getAllPricingPlans",
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

export const getEnterprisePlan = async (req: Request, res: Response) => {
  try {
    const plan = await prismaClient?.plans?.findFirst({
      where: {
        isActive: true,
        billingType: "CUSTOM",
      },
    });

    if (!plan) {
      return sendSuccess(res, null, "ok");
    }

    const responseData = {
      ...plan,
      features: JSON.parse(JSON.stringify(plan?.features)),
      createdAt: plan?.createdAt?.toString(),
      updatedAt: plan?.updatedAt,
    };

    return sendSuccess(res, responseData, "ok");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "user",
      action: "getEnterprisePlan",
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

export const getAllSessions = async (req: Request, res: Response) => {
  try {
    const sessions = await prismaClient?.session?.findMany({
      where: {
        userId: req?.userId,
      },
    });

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") {
        headers[key] = value;
      } else if (Array.isArray(value)) {
        headers[key] = value.join(";");
      }
    }

    const session = await auth.api.getSession({ headers });

    const responseData = sessions.map((item) => {
      const info = parseDeviceInfo(item?.userAgent);
      const location = getLocation(item?.ipAddress);
      return {
        ...item,
        token: "",
        isCurrent: session?.session?.token === item?.token,
        city: location?.city,
        region: location?.region,
        country: location?.country,
        browser: info.browser,
        browserVersion: info.browserVersion || "",
        os: info.os,
        osVersion: info.osVersion || "",
        deviceBrand: info.deviceBrand || "",
        deviceModel: info.deviceModel || "",
        deviceType: info?.deviceType || "",
        lastLogin: new Date(item.updatedAt).toUTCString(),
      };
    });

    return sendSuccess(res, responseData, "ok");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "user",
      action: "getAllSessions",
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

export const logOutFromSession = async (req: Request, res: Response) => {
  try {
    const { payload } = await req.body;

    if (!payload) {
      return sendError(res, 400, "Payload is required");
    }

    const { session_id } = payload;

    if (!session_id) {
      return sendError(res, 400, "session_id is required");
    }

    const session = await prismaClient?.session?.findFirst({
      where: {
        id: session_id,
      },
    });
    if (!session) {
      return sendError(res, 404, "Session not found");
    }

    const result = await prismaClient?.session?.deleteMany({
      where: {
        id: session?.id,
      },
    });

    if (!result?.count) {
      return sendSuccess(res, null, "Session already logged out");
    }

    return sendSuccess(res, null, "Session logged out successfully");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "user",
      action: "logOutFromSession",
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

export const logOutFromAllSession = async (req: Request, res: Response) => {
  try {
    const sessions = await prismaClient?.session?.findMany({
      where: {
        userId: req?.userId,
      },
    });
    if (!sessions || !sessions?.length) {
      return sendError(res, 404, "No session found");
    }

    await auth.api.signOut({
      returnHeaders: true,
      headers: fromNodeHeaders(req.headers),
    });

    await prismaClient?.session?.deleteMany({
      where: {
        userId: req?.userId,
      },
    });

    res.clearCookie("better-auth.dont_remember");
    res.clearCookie("better-auth.role_cache");
    res.clearCookie("better-auth.session_data");
    res.clearCookie("better-auth.session_token");
    res.clearCookie("__Secure-better-auth.dont_remember");
    res.clearCookie("__Secure-better-auth.role_cache");
    res.clearCookie("__Secure-better-auth.session_data");
    res.clearCookie("__Secure-better-auth.session_token");

    return sendSuccess(res, null, "All Sessions are logged out successfully");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "user",
      action: "logOutFromSession",
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

export const getFullWalletData = async (req: Request, res: Response) => {
  try {
    // const userId = req?.userId;
    // if (!userId) {
    //   return sendError(res, 401, "Unauthorized");
    // }
    // const wallet = await prismaClient?.userWallet?.findFirst({
    //   where: {
    //     userId,
    //   },
    // });
    // return sendSuccess(res, wallet, "ok");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "user",
      action: "getFullWalletData",
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

export const getWalletData = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    if (!userId) {
      return sendError(res, 401, "Unauthorized");
    }

    const wallet = await prismaClient?.userWallet?.findFirst({
      where: {
        userId,
      },
    });

    return sendSuccess(res, wallet, "ok");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "user",
      action: "getWalletData",
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

export const getUserTransactions = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    if (!userId) {
      return sendError(res, 401, "Unauthorized");
    }

    // Get query parameters for filtering and pagination
    const { type, limit = "50", offset = "0" } = req.query;

    // Build where clause
    const whereClause: any = { userId };
    
    // Filter by transaction type if provided
    if (type && typeof type === "string") {
      const validTypes = ["EARNING", "WITHDRAWAL", "PURCHASE", "REFUND", "BONUS", "OTHER"];
      if (validTypes.includes(type.toUpperCase())) {
        whereClause.transactionType = type.toUpperCase();
      }
    }

    // Get total count for pagination
    const totalCount = await prismaClient?.userTransaction?.count({
      where: whereClause,
    });

    // Get transactions with related data
    const transactions = await prismaClient?.userTransaction?.findMany({
      where: whereClause,
      include: {
        dashboardAndHub: {
          include: {
            androidApp: {
              select: {
                appName: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: parseInt(limit as string, 10),
      skip: parseInt(offset as string, 10),
    });

    // Pre-fetch Refund records for REFUND transactions to show rupee amounts
    const refundPaymentIds = (transactions || [])
      .filter((t) => t.transactionType === "REFUND" && t.razorpayPaymentId)
      .map((t) => t.razorpayPaymentId!);
    const refundLookup = new Map<string, { amount: number; count: number }>();
    if (refundPaymentIds.length > 0) {
      const refunds = await prismaClient.refund.findMany({
        where: { razorpayPaymentId: { in: refundPaymentIds }, status: "PROCESSED" },
        select: { razorpayPaymentId: true, amount: true },
      });
      for (const r of refunds) {
        const key = r.razorpayPaymentId;
        const prev = refundLookup.get(key);
        if (prev) {
          prev.amount += r.amount;
          prev.count += 1;
        } else {
          refundLookup.set(key, { amount: r.amount, count: 1 });
        }
      }
    }

    // Format the response
    const formattedTransactions = transactions?.map((txn) => {
      // Determine description based on transaction type and action
      let description = "";
      let amount = "";
      let change = "";
      let changeType = txn.status === "CREDIT" ? "positive" : "negative";

      switch (txn.transactionType) {
        case "PURCHASE":
          if (txn.status === "CREDIT") {
            description = "Package Purchase";
            amount = `+${txn.package || 0} Packages`;
            change = `+${txn.package || 0} Packages`;
          } else {
            // Use paymentMethod to determine label; fall back to checking non-null field
            const pm = txn.paymentMethod;
            if (pm === "PROMO_FREE") {
              description = txn.dashboardAndHub?.androidApp?.appName
                ? `Submitted "${txn.dashboardAndHub.androidApp.appName}" (Promo)` 
                : "Submitted (Promo)";
              amount = "0 (Promo)";
              change = "0 (Promo)";
            } else if (pm === "PACKAGE" || (!pm && txn.package && (txn.package > 0 || !txn.points))) {
              description = txn.dashboardAndHub?.androidApp?.appName 
                ? `Submitted "${txn.dashboardAndHub.androidApp.appName}"` 
                : "Package Used";
              amount = `-${txn.package || 0} Package`;
              change = `-${txn.package || 0} Package`;
            } else {
              // POINTS (default for hub/free apps)
              description = txn.dashboardAndHub?.androidApp?.appName 
                ? `Submitted "${txn.dashboardAndHub.androidApp.appName}"` 
                : "Points Used";
              amount = `-${txn.points || 0} Points`;
              change = `-${txn.points || 0} Points`;
            }
          }
          break;
        case "EARNING":
          description = txn.dashboardAndHub?.androidApp?.appName
            ? `Completed test for "${txn.dashboardAndHub.androidApp.appName}"`
            : "Points Earned";
          amount = `+${txn.points || 0} Points`;
          change = `+${txn.points || 0} Points`;
          break;
        case "BONUS":
          description = "Bonus Reward";
          amount = `+${txn.points || 0} Points`;
          change = `+${txn.points || 0} Points`;
          break;
        case "WITHDRAWAL":
          description = "Withdrawal";
          amount = `-${txn.points || 0} Points`;
          change = `-${txn.points || 0} Points`;
          break;
        case "REFUND":
          if (txn.razorpayPaymentId && refundLookup.has(txn.razorpayPaymentId)) {
            const refundInfo = refundLookup.get(txn.razorpayPaymentId)!;
            const refundedInr = refundInfo.amount / 100;
            description = `Refund — ₹${refundedInr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} returned to your original payment method`;
            amount = `₹${refundedInr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            change = `-${txn.package || 0} Packages`;
          } else {
            description = "Refund";
            amount = `+${txn.package || 0} Packages`;
            change = `+${txn.package || 0} Packages`;
          }
          break;
        default:
          description = "Transaction";
          if (txn.status === "CREDIT") {
            amount = txn.points ? `+${txn.points} Points` : `+${txn.package} Packages`;
            change = amount;
          } else {
            amount = txn.points ? `-${txn.points} Points` : `-${txn.package} Packages`;
            change = amount;
          }
      }

      // Determine transaction type label for display
      let typeLabel: string = txn.transactionType;
      if (txn.transactionType === "PURCHASE") {
        if (txn.status === "CREDIT") {
          typeLabel = "Package Purchase";
        } else if (txn.paymentMethod === "PROMO_FREE") {
          typeLabel = "Promo Used";
        } else if (txn.paymentMethod === "POINTS" || (txn.points && txn.points > 0)) {
          typeLabel = "Points Used";
        } else {
          typeLabel = "Package Used";
        }
      } else if (txn.transactionType === "EARNING") {
        typeLabel = "Points Earned";
      } else if (txn.transactionType === "BONUS") {
        typeLabel = "Bonus";
      } else if (txn.transactionType === "WITHDRAWAL") {
        typeLabel = "Withdrawal";
      } else if (txn.transactionType === "REFUND") {
        typeLabel = "Refund";
      }

      return {
        id: `TXN-${txn.id.toString().padStart(3, "0")}`,
        date: txn.createdAt.toISOString().split("T")[0],
        type: typeLabel,
        description,
        amount,
        change,
        status: "Completed",
        changeType,
        transactionType: txn.transactionType,
        action: txn.action,
        points: txn.points,
        package: txn.package,
        paymentMethod: txn.paymentMethod,
      };
    });

    return sendSuccess(
      res,
      {
        transactions: formattedTransactions,
        pagination: {
          total: totalCount || 0,
          limit: parseInt(limit as string, 10),
          offset: parseInt(offset as string, 10),
        },
      },
      "Transactions fetched successfully",
    );
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "user",
      action: "getUserTransactions",
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

export const saveDiscoverySource = async (req: Request, res: Response) => {
  try {
    const { payload } = await req.body;
    const { discovery_source } = payload || {};

    if (!discovery_source || typeof discovery_source !== "string") {
      return sendError(res, 400, "discovery_source is required");
    }

    const detail = await prismaClient?.userDetail?.findFirst({
      where: { userId: req?.userId },
    });

    if (!detail) {
      return sendError(res, 404, "User detail not found");
    }

    await prismaClient?.userDetail?.update({
      where: { id: detail.id },
      data: {
        discovery_source,
        discovery_source_answered: true,
      },
    });

    return sendSuccess(res, null, "Discovery source saved");
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
};

// ==================== IMMEDIATE ATTENTION REQUIRED (IAR) ====================

export const getUserImmediateAttention = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    if (!userId) {
      return sendError(res, 401, "Unauthorized");
    }

    const items = await prismaClient.immediateAttention.findMany({
      where: {
        userId,
        isActive: true,
      },
      orderBy: { sortOrder: "asc" },
    });

    const formatted = items.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }));

    return sendSuccess(res, formatted, "ok");
  } catch (error) {
    return sendError(res, 500, error instanceof Error ? error.message : "Internal Server Error");
  }
};

/**
 * Public endpoint: returns minimal info about an email so the deactivated
 * page can decide which reactivation UX to show. No sensitive fields leaked.
 */
export const checkEmailStatus = async (req: Request, res: Response) => {
  try {
    const email = (req.query?.email as string) || "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendError(res, 400, "A valid email is required");
    }

    const user = await prismaClient.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: {
        isActive: true,
        userDetail: { select: { auth_type: true } },
      },
    });

    if (!user) {
      return sendSuccess(res, {
        exists: false,
        authType: null,
        isActive: null,
      });
    }

    return sendSuccess(res, {
      exists: true,
      authType: user.userDetail?.auth_type ?? null,
      isActive: user.isActive,
    });
  } catch (error) {
    logger.error("checkEmailStatus error:", error);
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

// ==================== ACCOUNT ACTIVE / INACTIVE ====================

/**
 * Toggle the current user's active status (soft deactivation / reactivation).
 * When deactivating, any active Handshake subscription is cancelled on Razorpay.
 */
export const toggleMyActiveStatus = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    if (!userId) {
      return sendError(res, 401, "Unauthorized");
    }

    const payload = req.body?.payload ?? req.body;
    const isActive = payload?.isActive;
    if (typeof isActive !== "boolean") {
      return sendError(res, 400, "isActive (boolean) is required");
    }

    const user = await prismaClient.user.findUnique({
      where: { id: userId },
      include: {
        userDetail: { include: { role: { select: { name: true } } } },
      },
    });

    if (!user) {
      return sendError(res, 404, "User not found");
    }

    if (user.userDetail?.role?.name === "super_admin") {
      return sendError(
        res,
        403,
        "Super Admin accounts cannot be deactivated for safety and security reasons",
      );
    }

    if (!isActive) {
      const activeSubs = await prismaClient.handshakeSubscription.findMany({
        where: {
          userId,
          status: { in: ["ACTIVE", "AUTHENTICATED", "PENDING", "CREATED"] },
        },
      });

      for (const sub of activeSubs) {
        if (isRazorpayConfigured()) {
          try {
            const razorpay = getRazorpayInstance();
            await razorpay.subscriptions.cancel(sub.razorpaySubscriptionId, false);
          } catch (cancelError) {
            logger.warn(
              "Razorpay subscription cancel failed during deactivation:",
              cancelError,
            );
          }
        }
        await prismaClient.handshakeSubscription.update({
          where: { id: sub.id },
          data: { status: "CANCELLED" },
        });
      }
    }

    const updated = await prismaClient.user.update({
      where: { id: userId },
      data: { isActive, deactivatedAt: isActive ? null : new Date() },
    });

    return sendSuccess(
      res,
      {
        isActive: updated.isActive,
        deactivatedAt: updated.deactivatedAt?.toISOString() ?? null,
      },
      isActive ? "Account reactivated" : "Account deactivated",
    );
  } catch (error) {
    logger.error("toggleMyActiveStatus error:", error);
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

/**
 * Public reactivation endpoint used from the login screen.
 * Requires the account's email + password to reactivate a deactivated account.
 */
export const reactivateAccount = async (req: Request, res: Response) => {
  try {
    const payload = req.body?.payload ?? req.body;
    const email = payload?.email as string | undefined;
    const password = payload?.password as string | undefined;

    if (!email || !password) {
      return sendError(res, 400, "Email and password are required");
    }

    const user = await prismaClient.user.findFirst({
      where: {
        email: { equals: email, mode: "insensitive" },
      },
      include: {
        userDetail: { include: { role: { select: { name: true } } } },
      },
    });

    if (!user) {
      return sendError(res, 401, "Invalid email or password");
    }

    const account = await prismaClient.account.findFirst({
      where: { userId: user.id, providerId: "credential" },
    });

    if (!account?.password) {
      return sendError(res, 401, "Invalid email or password");
    }

    const passwordValid = await verifyPassword(password, account.password);
    if (!passwordValid) {
      return sendError(res, 401, "Invalid email or password");
    }

    if (user.userDetail?.role?.name === "super_admin") {
      return sendError(
        res,
        403,
        "Super Admin accounts cannot be reactivated through this flow",
      );
    }

    if (user.isActive) {
      return sendError(res, 400, "Account is already active");
    }

    await prismaClient.user.update({
      where: { id: user.id },
      data: { isActive: true, deactivatedAt: null },
    });

    return sendSuccess(res, "Account reactivated successfully", "ok");
  } catch (error) {
    logger.error("reactivateAccount error:", error);
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};
