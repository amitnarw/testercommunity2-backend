import { type Request, type Response } from "express";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2 } from "@/lib/r2";

export const createUploadUrl = async (req: Request, res: Response) => {
  try {
    const { payload } = req.body;
    const { filename, contentType, size, type } = payload;

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

export const extractKey = ({ url }: { url: string }) => {
  return url?.split(process.env.R2_MEDIA_BASE_URL + "/")?.[1];
};

export const deleteFunction = async ({ url }: { url: string }) => {
  try {
    const extractedKey = extractKey({ url });
    const command = new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: extractedKey,
    });

    await r2?.send(command);

    return true;
  } catch {
    return false;
  }
};

export const deleteFileFromR2 = async (req: Request, res: Response) => {
  try {
    const { url } = req?.params;

    if (url) {
      return sendError(res, 400, "Please send url");
    }

    const check = await deleteFunction({ url });

    if (!check) {
      return sendError(res, 400, "Delete of R2 file failed");
    }

    return sendSuccess(res, null, "File from R2 deleted successfully");
  } catch (error: any) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "r2",
      action: "deleteFileFromR2",
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
