import { auth, type SessionWithRole } from "@/lib/auth";
import { sendError } from "@/utils/response";
import { type NextFunction, type Request, type Response } from "express";

export const checkAuthentication = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const session_token =
      req.cookies["better-auth.session_token"] ||
      req.cookies["__Secure-better-auth.session_token"] ||
      req.cookies["better-auth_session_token"];

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") {
        headers[key] = value;
      } else if (Array.isArray(value)) {
        headers[key] = value.join(";");
      }
    }

    headers["cookie"] =
      `better-auth.session_token=${session_token}; __Secure-better-auth.session_token=${session_token}`;

    const session: SessionWithRole | null = await auth.api.getSession({
      headers,
    });

    if (!session) {
      return sendError(res, 401, "Unauthorized");
    }

    req.userId = session?.user?.id;
    req.role = session?.role?.name;
    next();
  } catch (error) {
    return sendError(res, 401, "Unauthorized");
  }
};
