import { type Request, type Response } from "express";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/utils/passwordUtils";
import {
  extractIpAddress,
  extractUserAgent,
  parseTimeString,
} from "@/utils/helperFunctions";
import { createToken } from "@/utils/tokenUtils";
import { v4 as uuidv4 } from "uuid";
import type { AuditLogPayload } from "@/types/audit_log";
import type { Prisma } from "prisma/generated/prisma";

const checkUser = async (req: Request) => {
  const userId = req?.userId;
  if (!userId) {
    return { success: false, code: 401, error: "Unauthorized request" };
  }

  const checkUser = await prismaClient?.user?.findFirst({
    where: {
      userId,
    },
    select: {
      userId: true,
      email: true,
      banned: true,
      banReason: true,
      role: true,
    },
  });
  if (!checkUser) {
    return { success: false, code: 404, error: "User not found" };
  }
  if (checkUser?.banned) {
    return {
      success: false,
      code: 403,
      error: checkUser?.banReason
        ? checkUser?.banReason
        : "Account is banned. Please contact support for more information.",
    };
  }

  return { success: true, code: 200, data: checkUser };
};

export const register = async (req: Request, res: Response) => {
  const ipAddress = extractIpAddress(req);
  const userAgent = extractUserAgent(req);
  try {
    const {
      first_name,
      last_name,
      email,
      emailVerified,
      phone,
      image,
      authType,
      password,

      roleId,

      country,
      profileType,
      jobRole,
      company: {
        company_name,
        company_size,
        position_in_company,
        company_website,
      },
      experience: {
        experience_level,
        total_published_apps,
        platform_development,
        publish_frequency,
      },
      service_usage,
      communication: { communication_methods, notification_preference },
      device: {
        deviceCompany,
        deviceModel,
        ram,
        os,
        screenResolution,
        language,
        network,
      },
    } = req.body;

    if (
      !first_name ||
      !last_name ||
      !email ||
      !password ||
      !roleId ||
      !profileType
    ) {
      return sendError(
        res,
        404,
        "First name, last name, email, password, role Id and user type are required"
      );
    }

    const hashedPassword = await hashPassword(password);

    const uniqueUuid = uuidv4();

    const checkUser = await prismaClient.user.findFirst({
      where: {
        OR: [email && email, phone && phone].filter(
          Boolean
        ) as Prisma.UserWhereInput[],
      },
    });
    if (checkUser) {
      const auditLogPayloadFail: AuditLogPayload = {
        actorId: req?.userId || "",
        actorRole: req?.role as string,
        module: "auth",
        action: "register",
        targetId: req?.userId || "",
        result: "fail",
        reason: "User already exist",
        ip: ipAddress || "",
        ua: userAgent || "",
      };
      return sendError(res, 409, "User already exist", auditLogPayloadFail);
    }

    const response = await prismaClient?.user?.create({
      data: {
        userId: `userId-${uniqueUuid}`,
        first_name,
        last_name,
        email,
        emailVerified: authType === "GOOGLE",
        phone,
        authType,
        password: hashedPassword,

        roleId,

        userDetail: {
          create: {
            country,
            profileType,
            jobRole,
            company_name,
            company_size,
            position_in_company,
            company_website,

            experience_level,
            total_published_apps,
            platform_development,
            publish_frequency,

            service_usage,

            communication_methods,
            notification_preference,

            deviceCompany,
            deviceModel,
            ram,
            os,
            screenResolution,
            language,
            network,
          },
        },

        activities: {
          create: {
            actionType: "REGISTER",
            description: "user registering for the first time",
            ipAddress,
            userAgent,
            status: "SUCCESS",
          },
        },

        logs: {
          create: {
            logType: "REGISTER",
            description: "user registering for the first time",
            ipAddress,
            userAgent,
          },
        },

        wallet: {
          create: {
            totalPoints: 0,
            totalAmount: 0,
            currency: "INR",
          },
        },
      },
    });

    if (!response) {
      const auditLogPayloadFail: AuditLogPayload = {
        actorId: req?.userId || "",
        actorRole: req?.role as string,
        module: "auth",
        action: "register",
        targetId: req?.userId || "",
        result: "fail",
        reason: "ERROR while registering new user",
        ip: ipAddress || "",
        ua: userAgent || "",
      };
      return sendError(
        res,
        400,
        "ERROR while registering new user",
        auditLogPayloadFail
      );
    }

    const auditLogPayloadSuccess: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "auth",
      action: "register",
      targetId: req?.userId || "",
      result: "success",
      ip: ipAddress || "",
      ua: userAgent || "",
    };
    return sendSuccess(
      res,
      null,
      "Registered successfully",
      auditLogPayloadSuccess
    );
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "auth",
      action: "register",
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

export const login = async (req: Request, res: Response) => {
  const ipAddress = extractIpAddress(req);
  const userAgent = extractUserAgent(req);
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return sendError(res, 400, "email and password are required");
    }

    const checkUser = await prismaClient?.user?.findFirst({
      where: {
        email,
      },
      select: {
        id: true,
        userId: true,
        first_name: true,
        last_name: true,
        email: true,
        password: true,
        phone: true,
        image: true,
        authType: true,
        banned: true,
        banReason: true,
        role: true,
        sessions: true,
        userDetail: true,
      },
    });

    if (!checkUser) {
      const auditLogPayloadFail: AuditLogPayload = {
        actorId: req?.userId || "",
        actorRole: req?.role as string,
        module: "auth",
        action: "login",
        targetId: req?.userId || "",
        result: "fail",
        reason: "Email address not found",
        ip: ipAddress || "",
        ua: userAgent || "",
      };
      return sendError(
        res,
        404,
        "Email address not found",
        auditLogPayloadFail
      );
    }

    if (checkUser?.banned) {
      const auditLogPayloadFail: AuditLogPayload = {
        actorId: req?.userId || "",
        actorRole: req?.role as string,
        module: "auth",
        action: "login",
        targetId: req?.userId || "",
        result: "fail",
        reason: "Account is banned.",
        ip: ipAddress || "",
        ua: userAgent || "",
      };
      return sendError(
        res,
        403,
        checkUser?.banReason
          ? checkUser?.banReason
          : "Account is banned. Please contact support for more information.",
        auditLogPayloadFail
      );
    }

    const checkPassword = verifyPassword(password, checkUser?.password);
    if (!checkPassword) {
      const auditLogPayloadFail: AuditLogPayload = {
        actorId: req?.userId || "",
        actorRole: req?.role as string,
        module: "auth",
        action: "login",
        targetId: req?.userId || "",
        result: "fail",
        reason: "Account is banned.",
        ip: ipAddress || "",
        ua: userAgent || "",
      };
      return sendError(res, 401, "Invalid password", auditLogPayloadFail);
    }

    const payload = {
      userId: checkUser?.userId,
      email: checkUser?.email,
      role: checkUser?.role?.name,
    };
    const access_token = await createToken(payload, "access_token");
    const refresh_token = await createToken(payload, "refresh_token");

    const checkSession = await prismaClient?.session?.findFirst({
      where: {
        userId: checkUser?.userId,
      },
    });

    const uniqueUuid = uuidv4();

    const accessExpiryMs = parseTimeString(
      process.env.ACCESS_TOKEN_EXPIRY || "1h"
    );
    const refreshExpiryMs = parseTimeString(
      process.env.REFRESH_TOKEN_EXPIRY || "30d"
    );

    const accessTokenExpiry = new Date(Date.now() + accessExpiryMs);
    const refreshTokenExpiry = new Date(Date.now() + refreshExpiryMs);

    await prismaClient?.session?.upsert({
      where: {
        id: checkSession?.id,
      },
      create: {
        userId: checkUser?.userId,
        accessToken: access_token?.data || "",
        accessTokenExpiry: accessTokenExpiry,
        refreshToken: refresh_token?.data || "",
        refreshTokenExpiry: refreshTokenExpiry,
        deviceId: uniqueUuid,
        userAgent: userAgent,
        ipAddress: ipAddress,
        lastUsedAt: Date(),
      },
      update: {
        accessToken: access_token?.data || "",
        accessTokenExpiry: accessTokenExpiry,
        refreshToken: refresh_token?.data || "",
        refreshTokenExpiry: refreshTokenExpiry,
        deviceId: uniqueUuid,
        userAgent: userAgent,
        ipAddress: ipAddress,
        lastUsedAt: Date(),
      },
    });

    await prismaClient?.userActivity?.create({
      data: {
        userId: checkUser?.userId,
        actionType: "LOGIN",
        ipAddress: ipAddress,
        userAgent: userAgent,
        status: "SUCCESS",
      },
    });

    await prismaClient?.userLogs?.create({
      data: {
        userId: checkUser?.userId,
        logType: "LOGIN",
        description: "user logged in",
        ipAddress,
        userAgent,
      },
    });

    const responsePayload = {
      userId: checkUser?.userId,
      first_name: checkUser?.first_name,
      last_name: checkUser?.last_name,
      phone: checkUser?.phone,
      image: checkUser?.image,
      authType: checkUser?.authType,
      role: checkUser?.role?.name,
      userDetails: checkUser?.userDetail
        ? {
            ...checkUser?.userDetail,
            createdAt: checkUser?.userDetail?.createdAt?.toString(),
            updatedAt: checkUser?.userDetail?.updatedAt?.toString(),
          }
        : null,
    };

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
      action: "login",
      targetId: req?.userId || "",
      result: "success",
      ip: ipAddress || "",
      ua: userAgent || "",
    };
    return sendSuccess(
      res,
      responsePayload,
      "Successfully logged in",
      auditLogPayloadSuccess
    );
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "auth",
      action: "login",
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

export const renewTokens = async (req: Request, res: Response) => {
  const ipAddress = extractIpAddress(req);
  const userAgent = extractUserAgent(req);
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
      userId: checkUserData?.userId,
      email: checkUserData?.email,
      role: checkUserData?.role?.name,
    };
    const access_token = await createToken(payload, "access_token");
    const refresh_token = await createToken(payload, "refresh_token");

    const checkSession = await prismaClient?.session?.findFirst({
      where: {
        userId: checkUserData?.userId,
      },
    });

    const uniqueUuid = uuidv4();

    const ipAddress = extractIpAddress(req);
    const userAgent = extractUserAgent(req);

    const accessExpiryMs = parseTimeString(
      process.env.ACCESS_TOKEN_EXPIRY || "1h"
    );
    const refreshExpiryMs = parseTimeString(
      process.env.REFRESH_TOKEN_EXPIRY || "30d"
    );

    const accessTokenExpiry = new Date(Date.now() + accessExpiryMs);
    const refreshTokenExpiry = new Date(Date.now() + refreshExpiryMs);

    await prismaClient?.session?.upsert({
      where: {
        id: checkSession?.id,
      },
      create: {
        userId: checkUserData?.userId || "",
        accessToken: access_token?.data || "",
        accessTokenExpiry: accessTokenExpiry,
        refreshToken: refresh_token?.data || "",
        refreshTokenExpiry: refreshTokenExpiry,
        deviceId: uniqueUuid,
        userAgent: userAgent,
        ipAddress: ipAddress,
        lastUsedAt: Date(),
      },
      update: {
        accessToken: access_token?.data || "",
        accessTokenExpiry: accessTokenExpiry,
        refreshToken: refresh_token?.data || "",
        refreshTokenExpiry: refreshTokenExpiry,
        deviceId: uniqueUuid,
        userAgent: userAgent,
        ipAddress: ipAddress,
        lastUsedAt: Date(),
      },
    });

    await prismaClient?.userActivity?.create({
      data: {
        userId: checkUserData?.userId || "",
        actionType: "RENEW_TOKENS",
        ipAddress: ipAddress,
        userAgent: userAgent,
        status: "SUCCESS",
      },
    });

    await prismaClient?.userLogs?.create({
      data: {
        userId: checkUserData?.userId,
        logType: "RENEW_TOKENS",
        description: "access and refresh tokens renewed",
        ipAddress,
        userAgent,
      },
    });

    res.cookie("access_token", access_token?.data, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 60 * 1000,
      path: "/",
    });

    // const responsePayload = {
    //   userId: checkUser?.userId,
    //   first_name: checkUser?.first_name,
    //   last_name: checkUser?.last_name,
    //   phone: checkUser?.phone,
    //   image: checkUser?.image,
    //   authType: checkUser?.authType,
    //   role: checkUser?.role?.name,
    //   userDetails: checkUser?.userDetail
    //     ? {
    //         ...checkUser?.userDetail,
    //         createdAt: checkUser?.userDetail?.createdAt?.toString(),
    //         updatedAt: checkUser?.userDetail?.updatedAt?.toString(),
    //       }
    //     : null,
    // };

    const auditLogPayloadSuccess: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "auth",
      action: "renewTokens",
      targetId: req?.userId || "",
      result: "success",
      ip: ipAddress || "",
      ua: userAgent || "",
    };
    return sendSuccess(
      res,
      null,
      "Tokens renewed successfully",
      auditLogPayloadSuccess
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

export const passwordResetCreate = async (req: Request, res: Response) => {
  const ipAddress = extractIpAddress(req);
  const userAgent = extractUserAgent(req);
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
        userId: checkUserData?.userId,
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    const payload = {
      userId: checkUserData?.userId,
      email: checkUserData?.email,
      role: checkUserData?.role?.name,
    };
    const password_reset_token = await createToken(payload, "password_reset");

    const passwordResetUrl = `${process.env.CORS_ORIGIN}/auth/password-reset?id=${password_reset_token?.data}`;

    const passwordResetExpiryMs = parseTimeString(
      process.env.PASSWORD_RESET_TOKEN_EXPIRY || "1h"
    );

    const accessTokenExpiry = new Date(Date.now() + passwordResetExpiryMs);

    await prismaClient?.passwordReset?.create({
      data: {
        password_reset_token: password_reset_token?.data || "",
        userId: checkUserData?.userId || "",
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
      ip: ipAddress || "",
      ua: userAgent || "",
    };
    return sendSuccess(
      res,
      passwordResetUrl,
      "Password reset url created",
      auditLogPayloadSuccess
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

export const passwordResetVerify = async (req: Request, res: Response) => {
  const ipAddress = extractIpAddress(req);
  const userAgent = extractUserAgent(req);
  try {
    const { token, password, confirm_password } = req.body;
    if (!token || !password || !confirm_password) {
      return sendError(
        res,
        404,
        "Token, password and confirm_password are required"
      );
    }

    if (password !== confirm_password) {
      const auditLogPayloadFail: AuditLogPayload = {
        actorId: req?.userId || "",
        actorRole: req?.role as string,
        module: "auth",
        action: "passwordResetVerify",
        targetId: req?.userId || "",
        result: "fail",
        reason: "Confirm password is invalid.",
        ip: ipAddress || "",
        ua: userAgent || "",
      };
      return sendError(
        res,
        400,
        "Confirm password is invalid.",
        auditLogPayloadFail
      );
    }

    const checkId = await prismaClient?.passwordReset?.findFirst({
      where: {
        password_reset_token: token,
        isActive: true,
      },
    });
    if (!checkId) {
      const auditLogPayloadFail: AuditLogPayload = {
        actorId: req?.userId || "",
        actorRole: req?.role as string,
        module: "auth",
        action: "passwordResetVerify",
        targetId: req?.userId || "",
        result: "fail",
        reason: "Password reset request not found",
        ip: ipAddress || "",
        ua: userAgent || "",
      };
      return sendError(
        res,
        404,
        "Password reset request not found",
        auditLogPayloadFail
      );
    }

    const hashedPassword = await hashPassword(password);

    await prismaClient?.user?.update({
      where: {
        userId: checkId?.userId,
      },
      data: {
        password: hashedPassword,
      },
    });

    await prismaClient?.passwordReset?.update({
      where: {
        id: checkId?.id,
      },
      data: {
        isActive: false,
      },
    });

    const auditLogPayloadSuccess: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "auth",
      action: "passwordResetVerify",
      targetId: req?.userId || "",
      result: "success",
      ip: ipAddress || "",
      ua: userAgent || "",
    };
    return sendSuccess(
      res,
      null,
      "Password reset successfully",
      auditLogPayloadSuccess
    );
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "auth",
      action: "passwordResetVerify",
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
