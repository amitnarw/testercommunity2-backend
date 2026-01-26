import { prismaClient } from "@/lib/prisma";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { type Request, type Response } from "express";

export const getControlRoomData = async (req: Request, res: Response) => {
  try {
    const response = await prismaClient?.controlRoom?.findFirst();
    const responseData = {
      ...response,
      createdAt: response?.createdAt?.toISOString() || "",
      updatedAt: response?.updatedAt?.toISOString() || "",
    };
    return sendSuccess(res, responseData, "ok");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "admin",
      action: "getControlRoomData",
      targetId: req?.userId || "",
      result: "fail",
      reason: error instanceof Error ? error.message : "Unknown error",
      ip: req?.userIpAddress || "",
      ua: req?.userAgent || "",
    };
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
      auditLogPayloadFail,
    );
  }
};

// getSubmittedApps
export const getSubmittedApps = async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string;

    // Build filter
    const where: any = {};
    if (status) {
      if (status === "ACCEPTED" || status === "AVAILABLE") {
        where.status = "AVAILABLE"; // Map accepted to available
      } else {
        where.status = status;
        if (status === "IN_REVIEW") {
          // Also include DRAFT if needed? No, user explicitly submits.
        }
      }
    }

    const apps = await prismaClient.dashboardAndHub.findMany({
      where: where,
      include: {
        androidApp: true,
        appOwner: {
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            createdAt: true,
            updatedAt: true,
            emailVerified: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return sendSuccess(res, apps as any, "Submitted apps fetched successfully");
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const acceptApp = async (req: Request, res: Response) => {
  try {
    const { payload } = req.body;
    const { id } = payload;
    if (!id) {
      return sendError(res, 400, "App ID is required");
    }

    const updatedApp = await prismaClient.dashboardAndHub.update({
      where: { id: parseInt(id) },
      data: {
        status: "AVAILABLE",
      },
    });

    return sendSuccess(res, updatedApp as any, "App approved successfully");
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const rejectApp = async (req: Request, res: Response) => {
  try {
    const { payload } = req.body;

    const { id, title, description, image, video } = payload;

    if (!id) {
      return sendError(res, 400, "App ID is required");
    }

    if (!description) {
      return sendError(res, 400, "Rejection reason (description) is required");
    }

    const updatedApp = await prismaClient.dashboardAndHub.update({
      where: { id: parseInt(id) },
      data: {
        status: "REJECTED",
        statusDetails: {
          title: title || "Submission Rejected",
          description: description,
          image: image || "",
          video: video || "",
        },
      },
    });

    return sendSuccess(res, updatedApp as any, "App rejected successfully");
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const getSubmittedAppsCount = async (req: Request, res: Response) => {
  try {
    const counts = await prismaClient.dashboardAndHub.groupBy({
      by: ["status"],
      _count: {
        _all: true,
      },
    });

    // Transform to formatted object
    const formattedCounts: Record<string, number> = {};
    counts.forEach((item) => {
      formattedCounts[item.status] = item._count._all;
    });

    // Calculate total
    const total = Object.values(formattedCounts).reduce(
      (acc, curr) => acc + curr,
      0,
    );
    formattedCounts["All"] = total;

    return sendSuccess(
      res,
      formattedCounts,
      "Submitted apps counts fetched successfully",
    );
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};
