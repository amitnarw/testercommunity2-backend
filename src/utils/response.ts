import type { AuditLogPayload } from "@/types/audit_log";
import { type Response } from "express";
import { encryptData, type JSONValue } from "./encryptDecryptPayload";
import { addAuditLog } from "@/controllers/audit_log.controller";

interface ApiResponse {
  success: boolean;
  message?: string;
  data: string | null;
}

export async function sendSuccess<T extends JSONValue>(
  res: Response,
  data?: T,
  message?: string,
  auditLogPayload?: AuditLogPayload
) {
  if (auditLogPayload) await addAuditLog(auditLogPayload);

  let encryptedData;
  if (data) {
    encryptedData = await encryptData(data);
    if (!encryptedData) {
      return sendError(res, 400, "Failed to encrypt response");
    }
  }

  const response: ApiResponse = {
    success: true,
    data: encryptedData ?? null,
    message,
  };

  return res.status(200).json(response);
}

export async function sendError(
  res: Response,
  code: number,
  message: string,
  auditLogPayload?: AuditLogPayload
) {
  if (auditLogPayload) {
    await addAuditLog(auditLogPayload);
  }

  const response: ApiResponse = {
    success: false,
    data: null,
    message,
  };
  return res.status(code || 500).json(response);
}
