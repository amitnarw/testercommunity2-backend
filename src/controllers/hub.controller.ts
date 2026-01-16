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
            costPoints: points_cost,
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

    const whereCond: any = {
      appOwnerId: {
        not: req?.userId,
      },
    };

    if (type === "AVAILABLE") {
      whereCond.status = "AVAILABLE";
      whereCond.testerRelations = {
        none: {
          testerId: req?.userId,
        },
      };
    } else {
      let relationStatus;
      if (type === "REQUESTED") relationStatus = "PENDING";
      else if (type === "IN_TESTING") relationStatus = "IN_PROGRESS";
      else if (type === "REJECTED") relationStatus = "REJECTED";
      else if (type === "COMPLETED") relationStatus = "COMPLETED";

      if (relationStatus) {
        whereCond.testerRelations = {
          some: {
            testerId: req?.userId,
            status: relationStatus,
          },
        };
      } else {
        // Fallback or empty result for unknown types that aren't available
        return sendSuccess(res, [], "ok");
      }
    }

    const hubApps = await prismaClient?.dashboardAndHub?.findMany({
      where: whereCond,
      include: {
        androidApp: {
          include: {
            appCategory: true,
          },
        },
        testerRelations: {
          where: {
            testerId: req?.userId,
          },
        },
      },
    });

    const result = hubApps?.map((item) => {
      let statusDetails = item?.statusDetails;
      // Default status from app, but for non-AVAILABLE apps we expect to override it
      let status: any = item.status;
      const relations = item?.testerRelations;

      if (relations && relations.length > 0) {
        const relation = relations[0];
        const rStatus = relation.status;

        // Map TesterStatus to frontend expected Status (DashboardAndHubStatus-like)
        if (rStatus === "PENDING") status = "REQUESTED";
        else if (rStatus === "IN_PROGRESS") status = "IN_TESTING";
        else if (rStatus === "REJECTED") status = "REJECTED";
        else if (rStatus === "COMPLETED") status = "COMPLETED";

        // Use relation specific statusDetails if rejected
        if (rStatus === "REJECTED" && relation.statusDetails) {
          statusDetails = relation.statusDetails;
        }
      } else if (type !== "AVAILABLE") {
        // If we requested non-available apps but relation is missing (shouldn't happen with correct query), keep app status?
        // Or strictly follow request. But query ensures relation exists.
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { testerRelations, ...rest } = item;

      return {
        ...rest,
        status,
        statusDetails: statusDetails
          ? JSON.parse(JSON.stringify(statusDetails))
          : null,
      };
    });

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
    // Count apps where the user is a tester based on TesterStatus
    const testerCounts = await prismaClient.testerRelation.groupBy({
      by: ["status"],
      where: {
        testerId: req.userId,
      },
      _count: {
        _all: true,
      },
    });

    // Count available apps (User is not owner, status AVAILABLE, user not a tester)
    const availableCount = await prismaClient.dashboardAndHub.count({
      where: {
        status: "AVAILABLE",
        appOwnerId: {
          not: req.userId,
        },
        testerRelations: {
          none: {
            testerId: req.userId,
          },
        },
      },
    });

    const result: Record<string, number> = {
      IN_REVIEW: 0,
      DRAFT: 0,
      REJECTED: 0,
      IN_TESTING: 0,
      COMPLETED: 0,
      ON_HOLD: 0,
      REQUESTED: 0,
      AVAILABLE: availableCount,
    };

    // Map TesterStatus to DashboardAndHubStatus for the counts
    for (const item of testerCounts) {
      const status = item.status;
      if (status === "PENDING") {
        result["REQUESTED"] = (result["REQUESTED"] || 0) + item._count._all;
      } else if (status === "IN_PROGRESS") {
        result["IN_TESTING"] = (result["IN_TESTING"] || 0) + item._count._all;
      } else if (status === "REJECTED") {
        result["REJECTED"] = (result["REJECTED"] || 0) + item._count._all;
      } else if (status === "COMPLETED") {
        result["COMPLETED"] = (result["COMPLETED"] || 0) + item._count._all;
      }
      // Note: Other statuses like DROPPED, REMOVED are ignored for now as they don't map directly to the counters on frontend
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
        feedback: {
          include: {
            media: true,
            tester: {
              select: { name: true },
            },
          },
        },
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

export const addHubAppTestingRequest = async (req: Request, res: Response) => {
  try {
    const { payload } = await req.body;
    if (!payload) {
      return sendError(res, 400, "Payload is required");
    }

    const { hub_id } = payload;
    if (!hub_id) {
      return sendError(res, 400, "hub_id is required");
    }

    const checkTester = await prismaClient?.dashboardAndHub?.findFirst({
      where: {
        id: Number(hub_id),
        status: "AVAILABLE",
        testerRelations: {
          none: {
            testerId: req?.userId,
            dashboardAndHubId: Number(hub_id),
          },
        },
      },
      include: {
        androidApp: true,
      },
    });

    if (
      !checkTester ||
      checkTester?.currentTester === null ||
      checkTester?.currentTester === undefined ||
      !checkTester?.totalTester ||
      checkTester?.currentTester >= checkTester?.totalTester
    ) {
      return sendError(res, 409, "Tester capacity is already full");
    }

    await prismaClient.$transaction(async (tx) => {
      await tx?.testerRelation?.create({
        data: {
          testerId: req?.userId || "",
          dashboardAndHubId: Number(hub_id),
          isActive: true,
          status: "PENDING",
          daysCompleted: 0,
        },
      });

      const dataValues: any = { currentTester: { increment: 1 } };
      if (checkTester.currentTester + 1 === checkTester.totalTester) {
        dataValues.status = "IN_TESTING";
      }

      await tx?.dashboardAndHub?.update({
        where: {
          id: Number(hub_id),
        },
        data: dataValues,
      });

      await tx?.userActivity?.create({
        data: {
          userId: req.userId || "",
          dashboardAndHubId: Number(hub_id),
          androidAppId: checkTester?.androidApp?.id,
          actionType: "JOIN_TEST",
          description: `Joined testing program for ${checkTester?.androidApp?.appName}`,
          ipAddress: req?.userIpAddress,
          userAgent: req?.userAgent,
          status: "SUCCESS",
        },
      });

      await tx?.notification?.create({
        data: {
          title: "New Tester Joined!",
          description: `A new tester has joined your ${checkTester?.androidApp?.appName} testing program.`,
          type: "NEW_JOIN",
          userId: checkTester?.appOwnerId,
          isActive: true,
        },
      });
    });

    return sendSuccess(res, null, "Tester join request sent successfully");
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
