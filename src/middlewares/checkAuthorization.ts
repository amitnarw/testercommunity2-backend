import { auth, type SessionWithRole } from "@/lib/auth";
import { prismaClient } from "@/lib/prisma";
import { sendError } from "@/utils/response";
import { type NextFunction, type Request, type Response } from "express";

export const checkAuthorization =
  ({ module, action }: { module: string; action: string }) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session_token =
        req.cookies["better-auth.session_token"] ||
        req.cookies["__Secure-better-auth.session_token"] ||
        req.cookies["better-auth_session_token"];

      const session: SessionWithRole | null = await auth.api.getSession({
        headers: {
          cookie: `better-auth.session_token=${session_token}; __Secure-better-auth.session_token=${session_token}`,
        },
      });

      if (!session) {
        return sendError(res, 401, "Unauthorized");
      }

      if (session?.role?.name === "SUPER_ADMIN") {
        next();
      } else {
        const checkRole = await prismaClient?.role.findFirst({
          where: {
            name: session?.role?.name,
          },
          select: {
            permissions: {
              select: {
                id: true,
                roleId: true,
                moduleId: true,
                canReadList: true,
                canReadSingle: true,
                canCreate: true,
                canUpdate: true,
                canDelete: true,
                module: true,
              },
            },
          },
        });
        if (!checkRole) {
          return sendError(res, 403, "Not Authorized");
        }

        if (
          checkRole?.permissions.some(
            (permission) =>
              permission.module.name === module &&
              (permission as any)[action] === true,
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
