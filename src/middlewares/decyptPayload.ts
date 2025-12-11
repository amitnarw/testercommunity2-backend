import { decryptData } from "@/utils/encryptDecryptPayload";
import { sendError } from "@/utils/response";
import { type NextFunction, type Request, type Response } from "express";

export const decryptPayload = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { payload } = req.body;
    if (!payload) {
      return sendError(res, 400, "Payload is required");
    }
    const decryptPayload = await decryptData(payload);
    if (!decryptPayload) {
      return sendError(res, 400, "Invalid payload");
    }

    req.body.payload = decryptPayload;
    next();
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
};
