import { type Request, type Response } from "express";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient } from "@/lib/prisma";

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
      app_url,
      app_name,
      app_logo_url,
      app_screenshot_url_1,
      app_screenshot_url_2,
      app_category_id,
      app_description,
      instruction_for_tester,
      minimum_android_version,
      total_tester,
      total_days,
    } = payload;
    if (
      !app_url ||
      !app_name ||
      !app_logo_url ||
      !app_screenshot_url_1 ||
      !app_screenshot_url_2 ||
      !app_category_id ||
      !app_description ||
      !instruction_for_tester ||
      !minimum_android_version ||
      !total_tester ||
      !total_days
    ) {
      return sendError(
        res,
        400,
        "app_url, app_name, app_logo_url, app_screenshot_url_1, app_screenshot_url_2, app_category_id, app_description, instruction_for_tester, minimum_android_version, total_tester, total_days are required"
      );
    }

    const package_name = extractPackageName(app_url);

    const androidAppData = await prismaClient?.androidApp?.create({
      data: {
        appName: app_name,
        appLogoUrl: app_logo_url,
        appScreenshotUrl1: app_screenshot_url_1,
        appScreenshotUrl2: app_screenshot_url_2,
        appCategoryId: app_category_id,
        packageName: package_name || "",
        description: app_description,
      },
    });

    const dashboardAndHub = await prismaClient?.dashboardAndHub?.create({
      data: {
        appId: androidAppData?.id,
        appOwnerId: req?.userId || "",
        currentTester: 0,
        totalTester: total_tester,
        currentDay: 0,
        totalDay: total_days,
        instructionsForTester: instruction_for_tester,
        // points
        // averageTimeTesting
        minimumAndroidVersion: minimum_android_version,
        status: "IN_REVIEW",
      },
    });

    return sendSuccess(res, { androidAppData, dashboardAndHub }, "ok");
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
