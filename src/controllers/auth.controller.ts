import { type Request, type Response } from "express";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/utils/passwordUtils";
import { parseTimeString } from "@/utils/helperFunctions";
import { createToken } from "@/utils/tokenUtils";
import { v4 as uuidv4 } from "uuid";
import type { AuditLogPayload } from "@/types/audit_log";
import type { Prisma } from "@prisma/client";

const checkUser = async (req: Request) => {
  const userId = req?.userId;
  if (!userId) {
    return { success: false, code: 401, error: "Unauthorized request" };
  }

  const checkUser = await prismaClient?.user?.findFirst({
    where: {
      id: userId,
    },
    select: {
      id: true,
      email: true,
      userDetail: {
        select: {
          userId: true,
          banned: true,
          ban_reason: true,
          role: true,
        },
      },
    },
  });
  if (!checkUser) {
    return { success: false, code: 404, error: "User not found" };
  }
  if (checkUser?.userDetail?.banned) {
    return {
      success: false,
      code: 403,
      error: checkUser?.userDetail?.ban_reason
        ? checkUser?.userDetail?.ban_reason
        : "Account is banned. Please contact support for more information.",
    };
  }

  return { success: true, code: 200, data: checkUser };
};

export const renewTokens = async (req: Request, res: Response) => {
  try {
    const {
      success: checkUserSuccess,
      data: checkUserData,
      error: checkUserError,
    } = await checkUser(req);
    if (!checkUserSuccess) {
      return sendError(res, 400, checkUserError || "Unknown error");
    }

    const payload = {
      userId: checkUserData?.id,
      email: checkUserData?.email,
      role: checkUserData?.userDetail?.role?.name,
    };
    const access_token = await createToken(payload, "access_token");
    const refresh_token = await createToken(payload, "refresh_token");

    const checkSession = await prismaClient?.session?.findFirst({
      where: {
        userId: checkUserData?.id,
      },
    });

    const checkAccount = await prismaClient?.account?.findFirst({
      where: {
        userId: checkUserData?.id,
        providerId: "credential",
      },
    });

    const accessExpiryMs = parseTimeString(
      process.env.ACCESS_TOKEN_EXPIRY || "1h",
    );
    const refreshExpiryMs = parseTimeString(
      process.env.REFRESH_TOKEN_EXPIRY || "30d",
    );

    const accessTokenExpiry = new Date(Date.now() + accessExpiryMs);
    const refreshTokenExpiry = new Date(Date.now() + refreshExpiryMs);

    if (checkSession?.id) {
      await prismaClient?.session?.update({
        where: {
          id: checkSession.id,
        },
        data: {
          token: access_token?.data || "",
          expiresAt: accessTokenExpiry,
          ipAddress: req?.userIpAddress,
          userAgent: req?.userAgent,
        },
      });
    }

    if (checkAccount?.id) {
      await prismaClient?.account?.update({
        where: {
          id: checkAccount.id,
        },
        data: {
          accessToken: access_token?.data || "",
          accessTokenExpiresAt: accessTokenExpiry,
          refreshToken: refresh_token?.data || "",
          refreshTokenExpiresAt: refreshTokenExpiry,
        },
      });
    }

    await prismaClient?.userActivity?.create({
      data: {
        userId: checkUserData?.id || "",
        actionType: "RENEW_TOKENS",
        ipAddress: req?.userIpAddress,
        userAgent: req?.userAgent,
        status: "SUCCESS",
      },
    });

    await prismaClient?.userLogs?.create({
      data: {
        userId: checkUserData?.id || "",
        logType: "RENEW_TOKENS",
        description: "access and refresh tokens renewed",
        ipAddress: req?.userIpAddress || "",
        userAgent: req?.userAgent || "",
      },
    });

    res.cookie("access_token", access_token?.data, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 60 * 1000,
      path: "/",
    });

    const auditLogPayloadSuccess: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "auth",
      action: "renewTokens",
      targetId: req?.userId || "",
      result: "success",
      ip: req?.userIpAddress || "",
      ua: req?.userAgent || "",
    };
    return sendSuccess(
      res,
      null,
      "Tokens renewed successfully",
      auditLogPayloadSuccess,
    );
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "auth",
      action: "renewTokens",
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

export const passwordResetCreate = async (req: Request, res: Response) => {
  try {
    const {
      success: checkUserSuccess,
      data: checkUserData,
      error: checkUserError,
    } = await checkUser(req);
    if (!checkUserSuccess) {
      return sendError(res, 400, checkUserError || "Unknown error");
    }

    await prismaClient?.passwordReset?.updateMany({
      where: {
        userId: checkUserData?.id,
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    const payload = {
      userId: checkUserData?.id,
      email: checkUserData?.email,
      role: checkUserData?.userDetail?.role?.name,
    };
    const password_reset_token = await createToken(payload, "password_reset");

    const passwordResetUrl = `${process.env.CORS_ORIGIN}/auth/password-reset?id=${password_reset_token?.data}`;

    const passwordResetExpiryMs = parseTimeString(
      process.env.PASSWORD_RESET_TOKEN_EXPIRY || "1h",
    );

    const accessTokenExpiry = new Date(Date.now() + passwordResetExpiryMs);

    await prismaClient?.passwordReset?.create({
      data: {
        password_reset_token: password_reset_token?.data || "",
        userId: checkUserData?.id || "",
        expireAt: accessTokenExpiry,
        isActive: true,
      },
    });

    const auditLogPayloadSuccess: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "auth",
      action: "passwordResetCreate",
      targetId: req?.userId || "",
      result: "success",
      ip: req?.userIpAddress || "",
      ua: req?.userAgent || "",
    };
    return sendSuccess(
      res,
      passwordResetUrl,
      "Password reset url created",
      auditLogPayloadSuccess,
    );
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "auth",
      action: "passwordResetCreate",
      targetId: req?.userId || "",
      result: "fail",
      reason: error instanceof Error ? error.message : "Unknown error",
      ip: req.userIpAddress || "",
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
