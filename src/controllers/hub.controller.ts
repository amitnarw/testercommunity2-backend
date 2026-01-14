import { type Request, type Response } from "express";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient } from "@/lib/prisma";
import type { DashboardAndHubStatus } from "prisma/generated/prisma";

function extractPackageName(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.searchParams.get("id");
  } catch {
    return null;
  }
}

export const getHubStats = async (req: Request, res: Response) => {
  try {
    // const userId = req?.userId;
    // if (!userId) {
    //   return sendError(res, 400, "UserId not found");
    // }
    // const response = await prismaClient.user.findUnique({
    //   where: { id: userId },
    //   select: {
    //     wallet: { select: { totalPoints: true } },
    //   },
    // });
    // const statusCounts = await prismaClient.dashboardAndHub.groupBy({
    //   by: ["status"],
    //   where: { currentTester: userId },
    //   _count: { _all: true },
    // });
    // const availableApps = await prismaClient.dashboardAndHub.findMany({
    //   where: { currentTester: userId, status: "AVAILABLE" },
    // });
    // const finalResponse = {
    //   wallet: response?.wallet?.totalPoints || 0,
    //   availableApps,
    //   statusCounts,
    // };
    // return sendSuccess(res, finalResponse, "ok");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "hub",
      action: "getHubStats",
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
      auditLogPayloadFail
    );
  }
};

export const getAppCategories = async (req: Request, res: Response) => {
  try {
    const result = await prismaClient?.appCategory?.findMany();
    return sendSuccess(res, result, "ok");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "hub",
      action: "getAppCategories",
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
      auditLogPayloadFail
    );
  }
};

export const addHubApp = async (req: Request, res: Response) => {
  try {
    const { payload } = await req.body;
    if (!payload) {
      return sendError(res, 400, "Payload is required");
    }

    const {
      app_name,
      app_url,
      app_logo_url,
      app_screenshot_url_1,
      app_screenshot_url_2,
      category_id,
      app_description,
      instruction_for_tester,
      minimum_android_version,
      total_tester,
      total_days,
      points_cost,
    } = payload;
    if (
      !app_name ||
      !app_url ||
      !app_logo_url ||
      !app_screenshot_url_1 ||
      !app_screenshot_url_2 ||
      !category_id ||
      !app_description ||
      !minimum_android_version ||
      !total_tester ||
      !total_days ||
      !points_cost
    ) {
      return sendError(
        res,
        400,
        "app_url, app_name, app_logo_url, app_screenshot_url_1, app_screenshot_url_2, category_id, app_description, minimum_android_version, total_tester, total_days and points_cost are required"
      );
    }

    const package_name = extractPackageName(app_url);

    const { androidAppData, dashboardAndHub } = await prismaClient.$transaction(
      async (tx) => {
        const androidAppData = await tx?.androidApp?.create({
          data: {
            appName: app_name,
            appLogoUrl: app_logo_url,
            appScreenshotUrl1: app_screenshot_url_1,
            appScreenshotUrl2: app_screenshot_url_2,
            appCategoryId: Number(category_id),
            packageName: package_name || "",
            description: app_description,
          },
        });

        const dashboardAndHub = await tx?.dashboardAndHub?.create({
          data: {
            appId: androidAppData?.id,
            appOwnerId: req?.userId || "",
            appType: "FREE",
            currentTester: 0,
            totalTester: total_tester,
            currentDay: 0,
            totalDay: total_days,
            instructionsForTester: instruction_for_tester,
            points: points_cost,
            // averageTimeTesting
            minimumAndroidVersion: minimum_android_version,
            status: "IN_REVIEW",
          },
        });

        const walletData = await tx?.userWallet?.update({
          where: {
            userId: req?.userId,
          },
          data: {
            totalPoints: {
              decrement: points_cost,
            },
          },
        });

        await tx?.userTransaction?.create({
          data: {
            userId: req.userId || "",
            userWalletId: walletData?.id,
            dashboardAndHubId: dashboardAndHub?.id,
            action: "TESTING",
            points: points_cost,
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
            description: app_description,
            ipAddress: req?.userIpAddress,
            userAgent: req?.userAgent,
            status: "SUCCESS",
          },
        });

        return { androidAppData, dashboardAndHub };
      }
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
      action: "addHubApp",
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
      auditLogPayloadFail
    );
  }
};

export const getHubSubmittedApp = async (req: Request, res: Response) => {
  try {
    const { type } = req?.params;

    if (!type) {
      return sendError(res, 400, "Please send type filter");
    }

    const hubSubmittedApp = await prismaClient?.dashboardAndHub?.findMany({
      where: {
        appOwnerId: req?.userId,
        status: type as DashboardAndHubStatus,
      },
      include: {
        androidApp: {
          include: {
            appCategory: true,
          },
        },
      },
    });

    const result = hubSubmittedApp?.map((item) => ({
      ...item,
      statusDetails: JSON.parse(JSON.stringify(item?.statusDetails)),
    }));

    return sendSuccess(res, result, "ok");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "user",
      action: "getHubSubmittedApp",
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
      auditLogPayloadFail
    );
  }
};

export const getSubmittedAppsCount = async (req: Request, res: Response) => {
  try {
    const appStatusCounts = await prismaClient?.dashboardAndHub?.groupBy({
      by: ["status"],
      where: {
        appOwnerId: req?.userId,
      },
      _count: {
        _all: true,
      },
    });

    const ALL_STATUSES = [
      "IN_REVIEW",
      "DRAFT",
      "REJECTED",
      "IN_TESTING",
      "COMPLETED",
      "ON_HOLD",
      "REQUESTED",
      "AVAILABLE",
    ] as const;

    const result = ALL_STATUSES.reduce<Record<string, number>>(
      (acc, status) => {
        acc[status] = 0;
        return acc;
      },
      {}
    );

    for (const item of appStatusCounts) {
      result[item.status] = item._count._all;
    }

    return sendSuccess(res, result, "ok");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "user",
      action: "getHubSubmittedApp",
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
      auditLogPayloadFail
    );
  }
};

export const getHubApps = async (req: Request, res: Response) => {
  try {
    const { type } = req?.params;

    if (!type) {
      return sendError(res, 400, "Please send type filter");
    }

    const hubApps = await prismaClient?.dashboardAndHub?.findMany({
      where: {
        appOwnerId: {
          not: req?.userId,
        },
        status: type as DashboardAndHubStatus,
      },
      include: {
        androidApp: {
          include: {
            appCategory: true,
          },
        },
      },
    });

    const result = hubApps?.map((item) => ({
      ...item,
      statusDetails: JSON.parse(JSON.stringify(item?.statusDetails)),
    }));

    return sendSuccess(res, result, "ok");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "user",
      action: "getHubSubmittedApp",
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
      auditLogPayloadFail
    );
  }
};

export const getAppsCount = async (req: Request, res: Response) => {
  try {
    const appStatusCounts = await prismaClient.dashboardAndHub.groupBy({
      by: ["status"],
      where: {
        appOwnerId: {
          not: req.userId,
        },
      },
      _count: {
        _all: true,
      },
    });

    const ALL_STATUSES = [
      "IN_REVIEW",
      "DRAFT",
      "REJECTED",
      "IN_TESTING",
      "COMPLETED",
      "ON_HOLD",
      "REQUESTED",
      "AVAILABLE",
    ] as const;

    const result = ALL_STATUSES.reduce<Record<string, number>>(
      (acc, status) => {
        acc[status] = 0;
        return acc;
      },
      {}
    );

    for (const item of appStatusCounts) {
      result[item.status] = item._count._all;
    }

    return sendSuccess(res, result, "ok");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "user",
      action: "getHubSubmittedApp",
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
      auditLogPayloadFail
    );
  }
};

export const getSingleHubAppDetails = async (req: Request, res: Response) => {
  try {
    const { id } = req?.params;

    if (!id) {
      return sendError(res, 400, "Please send id of the hub app");
    }

    const hubAppDetails = await prismaClient?.dashboardAndHub?.findFirst({
      where: {
        id: Number(id),
      },
      include: {
        androidApp: {
          include: {
            appCategory: true,
          },
        },
        appOwner: true,
      },
    });

    const result = {
      ...hubAppDetails,
      statusDetails: JSON.parse(JSON.stringify(hubAppDetails?.statusDetails)),
    };

    return sendSuccess(res, result, "ok");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "user",
      action: "getHubSubmittedApp",
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
      auditLogPayloadFail
    );
  }
};
