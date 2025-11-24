/// <reference path="../types/global.d.ts" />
import { NextFunction, Request, Response } from "express";
import { sendError } from "../util/response";
import { verifyAccessToken, verifyRefreshToken } from "../services/tokenService";
import { Role } from "../models/documents/role";

export const checkAuthorizationAccess = ({ module, action }: { module: string, action: string }) => async (req: Request, res: Response, next: NextFunction) => {
    try {
        const accessToken = req.cookies.accessToken;

        if (!accessToken) {
            return sendError(res, 401, "Unauthorized");
        }
        const result = await verifyAccessToken({ token: accessToken });
        if (!result.success) {
            return sendError(res, 401, "Invalid access token");
        }

        const authorization = result?.data?.role;
        if (!authorization) {
            return sendError(res, 401, "Unauthorized");
        }

        if (authorization === "SUPER_ADMIN") {
            next();
        } else {
            const role = await Role.findOne({ name: authorization });
            if (!role) {
                return sendError(res, 403, "Not Authorized");
            }

            if (role.permissions.some((permission) => permission.module === module && permission.actions.includes(action))) {
                next();
            } else {
                return sendError(res, 403, "Not Authorized");
            }
        }

    } catch (error) {
        return sendError(res, 401, "Unauthorized");
    }
}

export const checkAuthenticationRefresh = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const refreshToken = req.cookies.refreshToken;

        if (!refreshToken) {
            return sendError(res, 401, "Unauthorized");
        }
        const result = await verifyRefreshToken({ token: refreshToken });
        if (!result.success) {
            return sendError(res, 401, "Invalid refresh token");
        }

        req.userId = result?.data?.userId;
        next();
    } catch (error) {
        return sendError(res, 401, "Unauthorized");
    }
}
