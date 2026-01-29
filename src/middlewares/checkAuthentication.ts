import { auth, type SessionWithRole } from "@/lib/auth";
import { sendError } from "@/utils/response";
import { type NextFunction, type Request, type Response } from "express";

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
