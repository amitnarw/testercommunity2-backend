import { sendError } from "@/utils/response";
import { verifyToken } from "@/utils/tokenUtils";
import { type NextFunction, type Request, type Response } from "express";

export const checkAuthenticationAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const accessToken = req.cookies.accessToken;

    if (!accessToken) {
      return sendError(res, 401, "Unauthorized");
    }
    const result = await verifyToken(accessToken, "access_token");
    if (!result.success) {
      return sendError(res, 401, "Invalid access token");
    }

    req.userId = result?.data?.userId;
    req.role = result?.data?.role;
    next();
  } catch (error) {
    return sendError(res, 401, "Unauthorized");
  }
};

export const checkAuthenticationRefresh = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return sendError(res, 401, "Unauthorized");
    }
    const result = await verifyToken(refreshToken, "refresh_token");
    if (!result.success) {
      return sendError(res, 401, "Invalid refresh token");
    }

    req.userId = result?.data?.userId;
    req.role = result?.data?.role;
    next();
  } catch (error) {
    return sendError(res, 401, "Unauthorized");
  }
};
