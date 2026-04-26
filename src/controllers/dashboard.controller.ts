import { type Request, type Response } from "express";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient } from "@/lib/prisma";
import { extractPackageName, isValidPlayStoreUrl, isValidPlayStoreLogoUrl } from "@/services/common";

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

    const inReviewAppsList = inReviewApps?.map((item: any) => ({
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

    const { appName, testingUrl, logoUrl, categoryId, instructions } = payload;
    if (!appName || !testingUrl || !logoUrl || !categoryId) {
      return sendError(
        res,
        400,
        "testingUrl, appName, logoUrl and categoryId are required",
      );
    }

    if (!isValidPlayStoreUrl(testingUrl)) {
      return sendError(
        res,
        400,
        "Testing URL must be a valid Google Play Store link (e.g., https://play.google.com/store/apps/details?id=com.example.app)",
      );
    }
    if (!isValidPlayStoreLogoUrl(logoUrl)) {
      return sendError(
        res,
        400,
        "Logo URL must be from play-lh.googleusercontent.com. Copy the URL from your app's Play Console store listing.",
      );
    }

    const package_name = extractPackageName(testingUrl);

    let costMoney = 999;

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
            costMoney: costMoney,
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

    if (!isValidPlayStoreUrl(testingUrl)) {
      return sendError(
        res,
        400,
        "Testing URL must be a valid Google Play Store link (e.g., https://play.google.com/store/apps/details?id=com.example.app)",
      );
    }
    if (!isValidPlayStoreLogoUrl(logoUrl)) {
      return sendError(
        res,
        400,
        "Logo URL must be from play-lh.googleusercontent.com. Copy the URL from your app's Play Console store listing.",
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
  } catch (error: any) {
    // Handle Prisma unique constraint errors (e.g., duplicate app name)
    if (error?.code === 'P2002') {
      const fieldMatch = error?.message?.match(/Unique constraint failed on the fields: \(`(.+?)`\)/);
      const fieldName = fieldMatch ? fieldMatch[1] : 'record';
      let friendlyMessage;
      if (fieldName === 'appName') {
        friendlyMessage = "An app with this name already exists in your account. Please use a different app name or update the existing one.";
      } else if (fieldName === 'packageName') {
        friendlyMessage = "This app has already been added. Please check your existing submissions.";
      } else {
        friendlyMessage = `This ${fieldName} is already in use. Please use a different one.`;
      }

      const auditLogPayloadFail: AuditLogPayload = {
        actorId: req?.userId || "",
        actorRole: req?.role as string,
        module: "user",
        action: "addDashboardAppDraft",
        targetId: req?.userId || "",
        result: "fail",
        reason: friendlyMessage,
        ip: req?.userIpAddress || "",
        ua: req?.userAgent || "",
      };
      return sendError(res, 400, friendlyMessage, auditLogPayloadFail);
    }

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

export const getDashboardApps = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    const { type } = req.params;

    if (!userId) {
      return sendError(res, 400, "UserId not found");
    }

    if (!type) {
      return sendError(res, 400, "Type is required");
    }

    const typeArray = (type as string).split(",");

    const apps = await prismaClient.dashboardAndHub.findMany({
      where: {
        appOwnerId: userId,
        appType: "PAID", // Corrected enum value based on schema
        status: {
          in: typeArray as any[],
        },
      },
      include: {
        androidApp: true,
        appOwner: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Determine the user's role/plan to show status details properly if needed
    // But for getDashboardApps, usually just mapping the DB object is enough.
    // The statusDetails JSON field might need parsing.

    const formattedApps = apps.map((app: any) => ({
      ...app,
      statusDetails: app.statusDetails
        ? JSON.parse(JSON.stringify(app.statusDetails))
        : null,
      updatedAt: app.updatedAt.toString(),
      createdAt: app.createdAt.toString(),
    }));

    return sendSuccess(res, formattedApps, "ok");
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
};

export const getAppsCount = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;

    if (!userId) {
      return sendError(res, 400, "UserId not found");
    }

    const counts = await prismaClient.dashboardAndHub.groupBy({
      by: ["status"],
      where: {
        appOwnerId: userId,
        appType: "PAID",
      },
      _count: {
        _all: true,
      },
    });

    const result: Record<string, number> = {};
    counts.forEach((item: any) => {
      result[item.status] = item._count._all;
    });

    return sendSuccess(res, result, "ok");
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
};

export const deleteDashboardApp = async (req: Request, res: Response) => {
  const userId = req?.userId;
  const { id } = req.params;
  const appIdNum = parseInt(id as string);

  try {
    if (!userId) {
      return sendError(res, 400, "UserId not found");
    }

    if (!id) {
      return sendError(res, 400, "App ID is required");
    }

    // Verify the app exists and belongs to the user
    const app = await prismaClient.dashboardAndHub.findFirst({
      where: {
        id: appIdNum,
        appOwnerId: userId,
      },
    });

    if (!app) {
      return sendError(res, 404, "App not found or access denied");
    }

    // Only allow deleting DRAFT apps
    if (app.status !== "DRAFT") {
      return sendError(res, 400, "Only draft apps can be deleted");
    }

    await prismaClient.$transaction(async (tx) => {
      // Delete related user activities
      await tx.userActivity.deleteMany({
        where: {
          dashboardAndHubId: appIdNum,
        },
      });

      // Delete related user transactions
      await tx.userTransaction.deleteMany({
        where: {
          dashboardAndHubId: appIdNum,
        },
      });

      // Delete the dashboardAndHub record
      await tx.dashboardAndHub.delete({
        where: { id: appIdNum },
      });

      // Delete the androidApp record
      await tx.androidApp.delete({
        where: { id: app.appId },
      });
    });

    return sendSuccess(res, null, "App deleted successfully");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "dashboard",
      action: "deleteDashboardApp",
      targetId: appIdNum?.toString() || "",
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
