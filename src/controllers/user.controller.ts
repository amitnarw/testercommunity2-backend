import { type Request, type Response } from "express";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { extractIpAddress, extractUserAgent } from "@/utils/helperFunctions";
import { prismaClient } from "@/lib/prisma";

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

