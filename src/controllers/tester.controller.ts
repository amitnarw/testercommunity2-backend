import { type Request, type Response } from "express";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient } from "@/lib/prisma";

export const getTesterProjects = async (req: Request, res: Response) => {
  try {
    const { status } = req?.query;

    // Build where condition: find DashboardAndHub entries where this user is a tester
    const whereCond: any = {
      testerRelations: {
        some: {
          testerId: req?.userId,
        },
      },
    };

    // Optional: filter by tester's status in the relation
    if (status && typeof status === "string") {
      whereCond.testerRelations.some.status = status;
    }

    const projects = await prismaClient?.dashboardAndHub?.findMany({
      where: whereCond,
      include: {
        androidApp: {
          include: {
            appCategory: true,
            ratings: {
              where: {
                userId: req?.userId,
                ratingType: "APP",
              },
              select: {
                rating: true,
              },
            },
          },
        },
        testerRelations: {
          where: {
            testerId: req?.userId,
          },
          include: {
            dailyVerifications: {
              orderBy: {
                dayNumber: "asc",
              },
            },
          },
        },
        feedback: {
          where: {
            testerId: req?.userId,
          },
        },
        _count: {
          select: {
            feedback: true,
            testerRelations: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    // Map to a tester-friendly response
    const result = projects?.map((project) => {
      const relation = project?.testerRelations?.[0];

      return {
        id: project.id,
        appId: project.appId,
        appName: project.androidApp?.appName,
        appLogo: project.androidApp?.appLogoUrl,
        packageName: project.androidApp?.packageName,
        category: project.androidApp?.appCategory?.name,
        description: project.androidApp?.description,
        appScreenshot1: project.androidApp?.appScreenshotUrl1,
        appScreenshot2: project.androidApp?.appScreenshotUrl2,
        appStatus: project.status,
        testerRating: project.androidApp?.ratings?.[0]?.rating || 0,
        testerStatus: relation?.status || null,
        totalDay: project.totalDay,
        currentDay: project.currentDay,
        totalTester: project.totalTester,
        currentTester: project.currentTester,
        rewardPoints: project.rewardPoints,
        costPoints: project.costPoints,
        instructionsForTester: project.instructionsForTester,
        minimumAndroidVersion: project.minimumAndroidVersion,
        daysCompleted: relation?.daysCompleted || 0,
        joinedAt: relation?.joinedAt,
        completedAt: relation?.completedAt,
        lastActivityAt: relation?.lastActivityAt,
        dailyVerifications: relation?.dailyVerifications || [],
        feedbackCount: project._count?.feedback || 0,
        totalTesters: project._count?.testerRelations || 0,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      };
    });

    return sendSuccess(res, result as any, "ok");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "tester",
      action: "getTesterProjects",
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

export const rateApp = async (req: Request, res: Response) => {
  try {
    const { appId, rating } = req.body;

    if (!appId || rating === undefined) {
      return sendError(res, 400, "App ID and rating are required");
    }

    const userId = req?.userId;

    const existingRating = await prismaClient?.rating?.findFirst({
      where: {
        appId: Number(appId),
        userId: userId,
        ratingType: "APP",
      },
    });

    if (existingRating) {
      await prismaClient?.rating?.update({
        where: { id: existingRating.id },
        data: { rating: Number(rating) },
      });
    } else {
      await prismaClient?.rating?.create({
        data: {
          rating: Number(rating),
          appId: Number(appId),
          userId: userId,
          ratingType: "APP",
        },
      });
    }

    return sendSuccess(res, null, "Rating saved successfully");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "tester",
      action: "rateApp",
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

export const updateTesterAvailability = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    const { availability } = req.body.payload;

    const validStatuses = ["AVAILABLE", "BUSY", "AWAY", "DO_NOT_DISTURB"];
    if (!availability || !validStatuses.includes(availability)) {
      return sendError(
        res,
        400,
        "Invalid availability status. Must be one of: AVAILABLE, BUSY, AWAY, DO_NOT_DISTURB",
      );
    }

    const updatedDetail = await prismaClient.userDetail.update({
      where: { userId },
      data: { availability },
    });

    return sendSuccess(
      res,
      { availability: updatedDetail.availability },
      "Availability updated successfully",
    );
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};
