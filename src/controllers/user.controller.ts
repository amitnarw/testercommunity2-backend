import { type Request, type Response } from "express";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { extractIpAddress, extractUserAgent } from "@/utils/helperFunctions";
import { prismaClient } from "@/lib/prisma";
import type { UserDetail } from "prisma/generated/prisma";

export const getUserProfileData = async (req: Request, res: Response) => {
  const ipAddress = extractIpAddress(req);
  const userAgent = extractUserAgent(req);
  try {
    const response = await prismaClient?.userDetail?.findFirst({
      where: {
        userId: req?.userId,
      },
    });
    if (!response) {
      return sendError(res, 400, "Error while getting User detail.");
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
      ip: ipAddress || "",
      ua: userAgent || "",
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
  const ipAddress = extractIpAddress(req);
  const userAgent = extractUserAgent(req);
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
      ip: ipAddress || "",
      ua: userAgent || "",
    };
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
      auditLogPayloadFail
    );
  }
};

export const saveProfileDate = async (req: Request, res: Response) => {
  const ipAddress = extractIpAddress(req);
  const userAgent = extractUserAgent(req);
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
      ip: ipAddress || "",
      ua: userAgent || "",
    };
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
      auditLogPayloadFail
    );
  }
};
