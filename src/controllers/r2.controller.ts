import { type Request, type Response } from "express";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";
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
  if (!url) return undefined;
  const baseUrl = process.env.R2_MEDIA_BASE_URL || "";
  if (url.startsWith(baseUrl)) {
    return url.split(baseUrl + "/")?.[1];
  }
  if (url.startsWith("/")) {
    return url.substring(1);
  }
  return url;
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
    // S5c-6: route declares /delete-r2-file/:key ,  read `key` (the old code
    // read a nonexistent `url` param, so the guard passed and every delete
    // failed with Key=undefined).
    const key = String(req?.params?.key || "");

    if (!key) {
      return sendError(res, 400, "Please send url");
    }

    const check = await deleteFunction({ url: key });

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

/**
 * S4d-1 (C-F1): Server-side file upload endpoint.
 * Accepts a single file via multipart/form-data, uploads to R2, returns the
 * public URL. Used by the penalty proof upload flow and any future flow
 * that needs direct server-side file handling.
 *
 * Body shape: multipart/form-data with a `file` field, optional `type` field.
 * Response: { url, key }
 */
export const uploadFileToR2 = async (req: Request, res: Response) => {
  try {
    // S5c-5: fail fast when R2 public base URL is not configured ,  a missing
    // base would otherwise persist a malformed relative "/key" as proofImageUrl.
    const baseUrl = (process.env.R2_MEDIA_BASE_URL || "").replace(/\/$/, "");
    if (!baseUrl) {
      return sendError(
        res,
        503,
        "File storage is not configured (R2_MEDIA_BASE_URL missing). Contact the administrator.",
      );
    }

    const file = (req as any).file as
      | { originalname: string; mimetype: string; size: number; buffer: Buffer }
      | undefined;
    const rawType = String((req.body && req.body.type) || "uploads");
    // S5c-5: sanitize the key prefix ,  user input must not pollute arbitrary
    // object-key namespaces.
    const type = /^[a-zA-Z0-9_-]{1,32}$/.test(rawType) ? rawType : "uploads";

    if (!file || !file.buffer || !file.originalname) {
      return sendError(
        res,
        400,
        "No file uploaded. Send multipart/form-data with a 'file' field.",
      );
    }

    // Validate content type
    if (
      !file.mimetype.startsWith("image/") &&
      !file.mimetype.startsWith("video/")
    ) {
      return sendError(res, 400, "Invalid file type. Must be image or video.");
    }

    // Validate size (50MB)
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return sendError(res, 400, "File too large (max 50MB).");
    }

    // Generate permanent object key
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${type}/${crypto.randomUUID()}-${safeName}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      ContentType: file.mimetype,
      Body: file.buffer,
    });

    await r2.send(command);

    const url = `${baseUrl}/${key}`;

    return sendSuccess(res, { url, key }, "File uploaded successfully");
  } catch (error: any) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "r2",
      action: "uploadFileToR2",
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
