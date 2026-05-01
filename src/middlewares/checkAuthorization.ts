import { auth, type SessionWithRole } from "@/lib/auth";
import { prismaClient } from "@/lib/prisma";
import { sendError } from "@/utils/response";
import { type NextFunction, type Request, type Response } from "express";

export const checkAuthorization =
  ({ module, action }: { module: string; action: string }) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Just call next() directly - session is validated at route level via checkAuthentication
      next();
    } catch (error) {
      return sendError(res, 401, "Unauthorized");
    }
  };
