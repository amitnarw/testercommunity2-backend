import { prismaClient } from "@/lib/prisma";
import { sendError } from "@/utils/response";
import { verifyToken } from "@/utils/tokenUtils";
import { type NextFunction, type Request, type Response } from "express";

export const checkAuthorizationAccess =
  ({ module, action }: { module: string; action: string }) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accessToken = req.cookies.accessToken;

      if (!accessToken) {
        return sendError(res, 401, "Unauthorized");
      }
      const result = await verifyToken(accessToken, "access_token");
      if (!result.success) {
        return sendError(res, 401, "Invalid access token");
      }

      const authorizedRole = result?.data?.role;
      if (!authorizedRole) {
        return sendError(res, 401, "Unauthorized");
      }

      if (authorizedRole === "SUPER_ADMIN") {
        next();
      } else {
        const checkRole = await prismaClient?.role.findFirst({
          where: {
            name: authorizedRole,
          },
        });
        if (!checkRole) {
          return sendError(res, 403, "Not Authorized");
        }

        if (
          role.permissions.some(
            (permission) =>
              permission.module === module &&
              permission.actions.includes(action)
          )
        ) {
          next();
        } else {
          return sendError(res, 403, "Not Authorized");
        }
      }
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
    const result = await verifyRefreshToken({ token: refreshToken });
    if (!result.success) {
      return sendError(res, 401, "Invalid refresh token");
    }

    req.userId = result?.data?.userId;
    next();
  } catch (error) {
    return sendError(res, 401, "Unauthorized");
  }
};
