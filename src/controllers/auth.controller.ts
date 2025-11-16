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

export const register = async (req: Request, res: Response) => {
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

    const ipAddress = extractIpAddress(req);
    const userAgent = extractUserAgent(req);
    const uniqueUuid = uuidv4();

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
      return sendError(res, 400, "ERROR while registering new user");
    }
    return sendSuccess(res, { payload: "Registered successfully" }, "ok");
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
};

export const login = async (req: Request, res: Response) => {
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
      return sendError(res, 404, "Email address not found");
    }

    if (checkUser?.banned) {
      return sendError(
        res,
        403,
        checkUser?.banReason
          ? checkUser?.banReason
          : "Account is banned. Please contact support for more information."
      );
    }

    const checkPassword = verifyPassword(password, checkUser?.password);
    if (!checkPassword) {
      return sendError(res, 401, "Invalid password");
    }

    const payload = {
      userId: checkUser?.userId,
      email: checkUser?.email,
      role: checkUser?.role?.name,
    };
    const access_token = await createToken(payload, "access_token");
    const refresh_token = await createToken(payload, "refresh_token");

    res.cookie("access_token", access_token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 60 * 1000,
      path: "/",
    });

    const checkSession = await prismaClient?.session?.findFirst({
      where: {
        userId: checkUser?.userId,
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

    return sendSuccess(res, responsePayload, "Successfully logged in");
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
};

export const renewTokens = async (req: Request, res: Response) => {
  try {
    const { userId } = req?.userId;
    if (!userId) {
      return sendError(res, 401, "Unauthorized request");
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
      return sendError(res, 404, "User not found");
    }
    if (checkUser?.banned) {
      return sendError(
        res,
        403,
        checkUser?.banReason
          ? checkUser?.banReason
          : "Account is banned. Please contact support for more information."
      );
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
        actionType: "RENEW_TOKENS",
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
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
};
