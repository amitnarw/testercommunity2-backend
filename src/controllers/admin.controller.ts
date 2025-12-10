import { prismaClient } from "@/lib/prisma";
import type { AuditLogPayload } from "@/types/audit_log";
import { extractIpAddress, extractUserAgent } from "@/utils/helperFunctions";
import { sendError, sendSuccess } from "@/utils/response";
import { type Request, type Response } from "express";

export const getControlRoomData = async (req: Request, res: Response) => {
  const ipAddress = extractIpAddress(req);
  const userAgent = extractUserAgent(req);
  try {
    const response = await prismaClient?.controlRoom?.findFirst();
    const responseData = {
      ...response,
      createdAt: response?.createdAt?.toISOString() || "",
      updatedAt: response?.updatedAt?.toISOString() || "",
    };
    return sendSuccess(res, responseData, "ok");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "admin",
      action: "getControlRoomData",
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
