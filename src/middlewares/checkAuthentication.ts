import { auth, type SessionWithRole } from "@/lib/auth";
import { sendError } from "@/utils/response";
import { type NextFunction, type Request, type Response } from "express";

export const checkAuthentication = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const session_token =
      req.cookies["better-auth.session_token"] ||
      req.cookies["better-auth_session_token"];

    const session: SessionWithRole | null = await auth.api.getSession({
      headers: { cookie: `better-auth.session_token=${session_token}` },
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
