import { type Request, type Response } from "express";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient } from "@/lib/prisma";
import { extractPackageName } from "@/services/common";

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    if (!userId) {
      return sendError(res, 400, "UserId not found");
    }
    const response = await prismaClient.user.findUnique({
      where: { id: userId },
      select: {
        wallet: { select: { totalPackages: true } },
      },
    });

    const statusCounts = await prismaClient.dashboardAndHub.groupBy({
      by: ["status"],
      where: { appOwnerId: userId, appType: "PAID" },
      _count: { _all: true },
    });

    const inReviewApps = await prismaClient.dashboardAndHub.findMany({
      where: { appOwnerId: userId, appType: "PAID", status: "IN_REVIEW" },
    });

    const inReviewAppsList = inReviewApps?.map((item) => ({
      ...item,
      statusDetails: JSON.parse(JSON.stringify(item?.statusDetails)),
      updatedAt: item?.updatedAt?.toString(),
      createdAt: item?.createdAt?.toString(),
    }));

    const finalResponse = {
      wallet: response?.wallet?.totalPackages || 0,
      inReviewApps: inReviewAppsList,
      statusCounts,
    };

    return sendSuccess(res, finalResponse, "ok");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "dashboard",
      action: "getDashboardStats",
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

export const addDashboardAppSubmit = async (req: Request, res: Response) => {
  try {
    const { payload } = await req.body;
    if (!payload) {
      return sendError(res, 400, "Payload is required");
    }

    const {
      appName,
      testingUrl,
      logoUrl,
      categoryId,
      instructions,
    } = payload;
    if (!appName || !testingUrl || !logoUrl || !categoryId) {
      return sendError(
        res,
        400,
        "testingUrl, appName, logoUrl and categoryId are required",
      );
    }

    const package_name = extractPackageName(testingUrl);

    const { androidAppData, dashboardAndHub } = await prismaClient.$transaction(
      async (tx) => {
        const androidAppData = await tx?.androidApp?.create({
          data: {
            appName: appName,
            appLogoUrl: logoUrl,
            appScreenshotUrl1: "",
            appScreenshotUrl2: "",
            appCategoryId: Number(categoryId),
            packageName: package_name || "",
          },
        });

        const dashboardAndHub = await tx?.dashboardAndHub?.create({
          data: {
            appId: androidAppData?.id,
            appOwnerId: req?.userId || "",
            appType: "PAID",
            currentTester: 0,
            totalTester: 0,
            currentDay: 0,
            totalDay: 0,
            instructionsForTester: instructions,
            minimumAndroidVersion: 0,
            status: "IN_REVIEW",
          },
        });

        const walletData = await tx?.userWallet?.update({
          where: {
            userId: req?.userId,
          },
          data: {
            totalPackages: {
              decrement: 1,
            },
          },
        });

        await tx?.userTransaction?.create({
          data: {
            userId: req.userId || "",
            userWalletId: walletData?.id,
            dashboardAndHubId: dashboardAndHub?.id,
            action: "APP_SUBMISSION",
            package: 1,
            transactionType: "PURCHASE",
            status: "DEBIT",
          },
        });

        await tx?.userActivity?.create({
          data: {
            userId: req.userId || "",
            dashboardAndHubId: dashboardAndHub?.id,
            androidAppId: androidAppData?.id,
            actionType: "SUBMIT_APP",
            ipAddress: req?.userIpAddress,
            userAgent: req?.userAgent,
            status: "SUCCESS",
          },
        });

        return { androidAppData, dashboardAndHub };
      },
    );

    const dashboardAndHubResult = {
      ...dashboardAndHub,
      statusDetails: JSON.parse(JSON.stringify(dashboardAndHub?.statusDetails)),
    };

    return sendSuccess(res, { androidAppData, dashboardAndHubResult }, "ok");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "user",
      action: "addDashboardAppSubmit",
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

export const addDashboardAppDraft = async (req: Request, res: Response) => {
  try {
    const { payload } = await req.body;
    if (!payload) {
      return sendError(res, 400, "Payload is required");
    }

    const { appName, testingUrl, logoUrl, categoryId, instructions } = payload;
    if (!appName || !testingUrl || !logoUrl || !categoryId) {
      return sendError(
        res,
        400,
        "testingUrl, appName, logoUrl and categoryId are required",
      );
    }

    const package_name = extractPackageName(testingUrl);

    const { androidAppData, dashboardAndHub } = await prismaClient.$transaction(
      async (tx) => {
        const androidAppData = await tx?.androidApp?.create({
          data: {
            appName: appName,
            appLogoUrl: logoUrl,
            appScreenshotUrl1: "",
            appScreenshotUrl2: "",
            appCategoryId: Number(categoryId),
            packageName: package_name || "",
          },
        });

        const dashboardAndHub = await tx?.dashboardAndHub?.create({
          data: {
            appId: androidAppData?.id,
            appOwnerId: req?.userId || "",
            appType: "PAID",
            currentTester: 0,
            totalTester: 0,
            currentDay: 0,
            totalDay: 0,
            instructionsForTester: instructions,
            minimumAndroidVersion: 0,
            status: "DRAFT",
          },
        });

        await tx?.userActivity?.create({
          data: {
            userId: req.userId || "",
            dashboardAndHubId: dashboardAndHub?.id,
            androidAppId: androidAppData?.id,
            actionType: "DRAFT",
            ipAddress: req?.userIpAddress,
            userAgent: req?.userAgent,
            status: "SUCCESS",
          },
        });

        return { androidAppData, dashboardAndHub };
      },
    );

    const dashboardAndHubResult = {
      ...dashboardAndHub,
      statusDetails: JSON.parse(JSON.stringify(dashboardAndHub?.statusDetails)),
    };

    return sendSuccess(res, { androidAppData, dashboardAndHubResult }, "ok");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "user",
      action: "addDashboardAppDraft",
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
