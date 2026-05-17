import { auth, type SessionWithRole } from "@/lib/auth";
import { sendError } from "@/utils/response";
import { type NextFunction, type Request, type Response } from "express";
import { prismaClient } from "@/lib/prisma";

export const checkAuthentication = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Pass all headers including cookies to the auth client
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") {
        headers[key] = value;
      } else if (Array.isArray(value)) {
        headers[key] = value.join(";");
      }
    }

    const session = await auth.api.getSession({
      headers,
    }) as SessionWithRole | null;

    if (!session) {
      return sendError(res, 401, "Unauthorized");
    }

    const userDetail = await prismaClient?.userDetail?.findUnique({
      where: { userId: session.user.id },
      select: { banned: true, ban_reason: true },
    });

    if (userDetail?.banned) {
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_BANNED",
        message: userDetail.ban_reason || "Your account has been suspended. Please contact support.",
      });
    }

    req.userId = session?.user?.id;
    req.role = session?.role?.name;
    next();
  } catch (error) {
    return sendError(res, 401, "Unauthorized");
  }
};
