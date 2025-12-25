import { type Request, type Response } from "express";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient } from "@/lib/prisma";
import type { UserDetail } from "prisma/generated/prisma";

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
    return sendSuccess(res, plans, "ok");
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
