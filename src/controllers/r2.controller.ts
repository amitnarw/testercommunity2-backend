import { type Request, type Response } from "express";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2 } from "@/lib/r2";

export const createUploadUrl = async (req: Request, res: Response) => {
  try {
    const { filename, contentType, size, type } = req.body;

    if (!filename || !contentType || !size || !type) {
      return sendError(
        res,
        400,
        "Please send filename, contentType, size and type",
      );
    }

    // 1. Validate
    const MAX_SIZE = 50 * 1024 * 1024; // 50MB
    if (size > MAX_SIZE) {
      return sendError(res, 400, "File too large");
    }

    if (
      !contentType.startsWith("image/") &&
      !contentType.startsWith("video/")
    ) {
      return sendError(res, 400, "Invalid file type");
    }

    // 2. Generate permanent object key
    const key = `${type}/${crypto.randomUUID()}-${filename}`;

    // 3. Create signed PUT URL
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      ContentType: contentType,
      ContentLength: size,
    });

    const uploadUrl = await getSignedUrl(r2, command, {
      expiresIn: 120, // 2 minutes
    });

    return sendSuccess(res, { uploadUrl, key }, "ok");
  } catch (error: any) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "r2",
      action: "createUploadUrl",
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
