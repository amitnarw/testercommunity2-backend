import { prismaClient } from "@/lib/prisma";
import { sendError } from "@/utils/response";
import { type NextFunction, type Request, type Response } from "express";

export const checkAuthorization =
  ({ module, action }: { module: string; action: string }) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const roleName = req.role;
      if (!roleName) {
        return sendError(res, 401, "Unauthorized - no role found");
      }

      // super_admin bypasses all permission checks
      if (roleName === "super_admin") {
        return next();
      }

      // Look up the role with its permissions
      const role = await prismaClient.role.findFirst({
        where: { name: roleName },
        include: {
          permissions: {
            include: { module: true },
          },
        },
      });

      if (!role) {
        return sendError(res, 403, "Forbidden - role not found");
      }

      const hasPermission = role.permissions.some(
        (p) =>
          p.module.name.toLowerCase() === module.toLowerCase() &&
          p[action as keyof typeof p] === true,
      );

      if (!hasPermission) {
        return sendError(res, 403, "Forbidden - insufficient permissions");
      }

      next();
    } catch (error) {
      return sendError(res, 401, "Unauthorized");
    }
  };
