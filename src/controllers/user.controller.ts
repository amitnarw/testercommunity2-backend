import { type Request, type Response } from "express";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient } from "@/lib/prisma";
import type { UserDetail } from "prisma/generated/prisma";
import DeviceDetector from "device-detector-js";
import geoip from "geoip-lite";
import { auth } from "@/lib/auth";
import { fromNodeHeaders } from "better-auth/node";

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
      auditLogPayloadFail
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
      auditLogPayloadFail
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
      auditLogPayloadFail
    );
  }
};

export const saveInitialProfileData = async (req: Request, res: Response) => {
  try {
    const response = await prismaClient?.userDetail?.findFirst({
      where: {
        userId: req?.userId,
      },
    });

    await prismaClient?.userDetail?.update({
      where: {
        id: response?.id,
      },
      data: {
        initial: false,
      },
    });

    return sendSuccess(res, null, "Initial: true");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "user",
      action: "saveInitialProfileData",
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
      auditLogPayloadFail
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
        initial: false,
      },
    });

    const checkAllValues = await prismaClient?.userDetail?.findFirst({
      where: {
        userId: req?.userId,
      },
    });

    if (
      checkAllValues?.first_name &&
      checkAllValues?.last_name &&
      checkAllValues?.phone &&
      checkAllValues?.auth_type &&
      checkAllValues?.roleId &&
      checkAllValues?.country &&
      checkAllValues?.profile_type &&
      checkAllValues?.job_role &&
      checkAllValues?.company_name &&
      checkAllValues?.company_size &&
      checkAllValues?.position_in_company &&
      checkAllValues?.company_website &&
      checkAllValues?.experience_level &&
      checkAllValues?.total_published_apps &&
      checkAllValues?.platform_development &&
      checkAllValues?.publish_frequency &&
      checkAllValues?.service_usage &&
      checkAllValues?.communication_methods &&
      checkAllValues?.notification_preference &&
      checkAllValues?.device_company &&
      checkAllValues?.device_model &&
      checkAllValues?.ram &&
      checkAllValues?.os &&
      checkAllValues?.screen_resolution &&
      checkAllValues?.language &&
      checkAllValues?.network
    ) {
      const controlData = await prismaClient?.controlRoom?.findFirst();
      const checkUserTransaction =
        await prismaClient?.userTransaction?.findFirst({
          where: {
            userId: req?.userId,
            action: "BONUS",
            points: controlData?.profileSurveyPoints || 200,
            transactionType: "BONUS",
            status: "CREDIT",
          },
        });

      if (!checkUserTransaction?.id) {
        const userWalletSave = await prismaClient?.userWallet?.upsert({
          where: {
            userId: req?.userId,
          },
          create: {
            userId: req?.userId || "",
            totalPoints: controlData?.profileSurveyPoints || 200,
            totalPackages: 0,
          },
          update: {
            totalPoints: {
              increment: 200,
            },
          },
        });

        await prismaClient?.userTransaction?.create({
          data: {
            userId: req?.userId || "",
            userWalletId: userWalletSave?.id,
            action: "BONUS",
            points: controlData?.profileSurveyPoints || 200,
            transactionType: "BONUS",
            status: "CREDIT",
          },
        });
      }
    }
    return sendSuccess(res, null, "User profile data saved successfully");
  } catch (error) {
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
      auditLogPayloadFail
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

    const result = await prismaClient?.notification?.findMany({
      where: {
        userId: req?.userId,
      },
    });

    const totalNotifications = await prismaClient?.notification?.count({
      where: {
        userId: req?.userId,
      },
    });

    return sendSuccess(
      res,
      { notifications: result, totalNotifications },
      "ok"
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
      auditLogPayloadFail
    );
  }
};

export const getAllPricingPlans = async (req: Request, res: Response) => {
  try {
    const plans = await prismaClient?.plans?.findMany({
      where: {
        isActive: true,
      },
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
      auditLogPayloadFail
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
      auditLogPayloadFail
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

    await prismaClient?.session?.delete({
      where: {
        id: session?.id,
      },
    });

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
      auditLogPayloadFail
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
      auditLogPayloadFail
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
      auditLogPayloadFail
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
      auditLogPayloadFail
    );
  }
};
