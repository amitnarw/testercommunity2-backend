import { type Request, type Response } from "express";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient } from "@/lib/prisma";
import type { DashboardAndHubStatus } from "prisma/generated/prisma";
import { deleteFunction } from "./r2.controller";
import { extractPackageName } from "@/services/common";

export const getHubStats = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    if (!userId) {
      return sendError(res, 400, "UserId not found");
    }
    const response = await prismaClient.user.findUnique({
      where: { id: userId },
      select: {
        wallet: { select: { totalPoints: true } },
      },
    });

    const appsSubmitted = await prismaClient.dashboardAndHub.count({
      where: { appOwnerId: userId },
    });

    const testersEngaged = await prismaClient.testerRelation.count({
      where: {
        dashboardAndHub: { appOwnerId: userId },
        status: { in: ["IN_PROGRESS", "COMPLETED"] },
      },
    });

    const testsCompleted = await prismaClient.testerRelation.count({
      where: {
        dashboardAndHub: { appOwnerId: userId },
        status: "COMPLETED",
      },
    });

    const statusCounts = await prismaClient.dashboardAndHub.groupBy({
      by: ["status"],
      where: { appOwnerId: userId, appType: "FREE" },
      _count: { _all: true },
    });

    const availableApps = await prismaClient.dashboardAndHub.findMany({
      where: {
        status: "AVAILABLE",
        appOwnerId: { not: userId },
        testerRelations: {
          none: {
            testerId: userId,
          },
        },
      },
      take: 10,
      include: {
        androidApp: {
          include: {
            appCategory: true,
          },
        },
      },
    });

    const finalResponse = {
      wallet: response?.wallet?.totalPoints || 0,
      appsSubmitted,
      testersEngaged,
      testsCompleted,
      availableApps: availableApps?.length || 0,
      statusCounts,
    };
    return sendSuccess(res, finalResponse, "ok");
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
      auditLogPayloadFail,
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
      auditLogPayloadFail,
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
        "app_url, app_name, app_logo_url, app_screenshot_url_1, app_screenshot_url_2, category_id, app_description, minimum_android_version, total_tester, total_days and points_cost are required",
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
      auditLogPayloadFail,
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
      auditLogPayloadFail,
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
      {},
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
      action: "getSubmittedAppsCount",
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
    } else if (type === "REQUESTED") {
      whereCond.testerRelations = {
        some: {
          testerId: req?.userId,
          status: "PENDING",
        },
      };
    } else if (type === "REJECTED") {
      whereCond.testerRelations = {
        some: {
          testerId: req?.userId,
          status: "REJECTED",
        },
      };
    } else if (type === "APPROVED") {
      // Waiting to start: User is IN_PROGRESS but App is still AVAILABLE
      whereCond.status = "AVAILABLE";
      whereCond.testerRelations = {
        some: {
          testerId: req?.userId,
          status: "IN_PROGRESS",
        },
      };
    } else if (type === "IN_TESTING") {
      // Active testing: User is IN_PROGRESS and App is IN_TESTING
      whereCond.status = "IN_TESTING";
      whereCond.testerRelations = {
        some: {
          testerId: req?.userId,
          status: "IN_PROGRESS",
        },
      };
    } else if (type === "COMPLETED") {
      whereCond.testerRelations = {
        some: {
          testerId: req?.userId,
          status: "COMPLETED",
        },
      };
    } else {
      return sendSuccess(res, [], "ok");
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
        else if (rStatus === "IN_PROGRESS") {
          // If app is AVAILABLE, it's APPROVED (Waiting to Start)
          // If app is IN_TESTING, it's IN_TESTING (Active)
          if (item.status === "AVAILABLE") status = "ACCEPTED";
          else if (item.status === "IN_TESTING") status = "IN_TESTING";
          else status = "IN_TESTING"; // Fallback
        } else if (rStatus === "REJECTED") status = "REJECTED";
        else if (rStatus === "COMPLETED") status = "COMPLETED";

        // Use relation specific statusDetails if rejected
        if (rStatus === "REJECTED" && relation.statusDetails) {
          statusDetails = relation.statusDetails;
        }
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
      action: "getHubApps",
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

export const getAppsCount = async (req: Request, res: Response) => {
  try {
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

    const testerApps = await prismaClient.testerRelation.findMany({
      where: {
        testerId: req.userId,
        // isActive: true, // Assuming we want active relations
      },
      select: {
        status: true,
        dashboardAndHub: {
          select: {
            status: true,
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
      ACCEPTED: 0,
      AVAILABLE: availableCount,
    };

    for (const app of testerApps) {
      const relationStatus = app.status;
      const appStatus = app.dashboardAndHub?.status;

      if (relationStatus === "PENDING") {
        result["REQUESTED"]++;
      } else if (relationStatus === "REJECTED") {
        result["REJECTED"]++;
      } else if (relationStatus === "COMPLETED") {
        result["COMPLETED"]++;
      } else if (relationStatus === "IN_PROGRESS") {
        if (appStatus === "AVAILABLE") {
          result["ACCEPTED"]++; // Waiting to start
        } else if (appStatus === "IN_TESTING") {
          result["IN_TESTING"]++; // Active
        } else {
          // Edge case: relation IN_PROGRESS but app COMPLETED or something else?
          // For now count as IN_TESTING or leave it?
          // If app is COMPLETED but user didn't mark complete, usually technically "IN_TESTING" for them or "Missed"
          result["IN_TESTING"]++;
        }
      }
    }

    return sendSuccess(res, result, "ok");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "user",
      action: "getAppsCount",
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

export const getSingleHubAppDetails = async (req: Request, res: Response) => {
  try {
    const { id } = req?.params;

    const { view } = req.query;
    if (!id) {
      return sendError(res, 400, "Please send id of the hub app");
    }

    const whereCondition: any = {
      id: Number(id),
    };

    const testerRelationsCondition: any = {};

    // If viewing as owner, ensure the user owns the app and fetch all tester relations
    if (view === "owner") {
      whereCondition.appOwnerId = req?.userId;
    } else {
      // Otherwise, only fetch the tester relation for the current user
      testerRelationsCondition.testerId = req?.userId;
    }

    const hubAppDetails = await prismaClient?.dashboardAndHub?.findFirst({
      where: whereCondition,
      include: {
        androidApp: {
          include: {
            appCategory: true,
          },
        },
        appOwner: true,
        feedback: {
          orderBy: {
            createdAt: "desc",
          },
          include: {
            media: true,
            tester: {
              select: { name: true },
            },
          },
        },
        testerRelations: {
          where: testerRelationsCondition,
          select: {
            testerId: true,
            isActive: true,
            status: true,
            statusDetails: true,
            dailyVerifications: true,
            daysCompleted: true,
            lastActivityAt: true,
            tester: {
              select: {
                name: true,
                email: true,
                image: true,
                createdAt: true,
                userDetail: {
                  select: {
                    country: true,
                    profile_type: true,
                    job_role: true,
                    experience_level: true,
                    device_company: true,
                    device_model: true,
                    ram: true,
                    os: true,
                    screen_resolution: true,
                    language: true,
                    network: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const result = {
      ...hubAppDetails,
      statusDetails: JSON.parse(JSON.stringify(hubAppDetails?.statusDetails)),
      testerRelations:
        hubAppDetails?.testerRelations &&
        hubAppDetails?.testerRelations?.length > 0
          ? hubAppDetails?.testerRelations?.map((item) => ({
              ...item,
              statusDetails: JSON.parse(JSON.stringify(item?.statusDetails)),
              dailyVerifications: item?.dailyVerifications?.map((item2) => ({
                ...item2,
                metaData: JSON.parse(JSON.stringify(item2?.metaData)),
              })),
            }))
          : [],
    };

    return sendSuccess(res, result, "ok");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "user",
      action: "getSingleHubAppDetails",
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
      return sendError(
        res,
        409,
        "The application owner is not accepting any more testers.",
      );
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

      await tx?.userActivity?.create({
        data: {
          userId: req.userId || "",
          dashboardAndHubId: Number(hub_id),
          androidAppId: checkTester?.androidApp?.id,
          actionType: "JOIN_TEST_REQUEST",
          description: `Your request to join testing for ${checkTester?.androidApp?.appName} has been sent successfully.`,
          ipAddress: req?.userIpAddress,
          userAgent: req?.userAgent,
          status: "SUCCESS",
        },
      });

      await tx?.notification?.create({
        data: {
          title: "New Tester Join Request!",
          description: `A new tester requested to join your ${checkTester?.androidApp?.appName} testing program.`,
          type: "NEW_JOIN_REQUEST",
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
      action: "addHubAppTestingRequest",
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

export const acceptSubmittedHubAppTestingRequest = async (
  req: Request,
  res: Response,
) => {
  try {
    const { payload } = await req.body;
    if (!payload) {
      return sendError(res, 400, "Payload is required");
    }

    const { hub_id, tester_id } = payload;
    if (!hub_id || !tester_id) {
      return sendError(res, 400, "hub_id and tester_id are required");
    }

    const checkTester = await prismaClient?.dashboardAndHub?.findFirst({
      where: {
        id: Number(hub_id),
        status: "AVAILABLE",
        testerRelations: {
          some: {
            testerId: tester_id,
            dashboardAndHubId: Number(hub_id),
          },
        },
      },
      include: {
        androidApp: true,
      },
    });

    if (!checkTester || !checkTester?.totalTester) {
      return sendError(res, 409, "Submitted App not found");
    }

    const testerRequest = await prismaClient?.testerRelation?.findFirst({
      where: {
        testerId: tester_id,
        dashboardAndHubId: Number(hub_id),
        isActive: true,
        status: "PENDING",
      },
    });

    if (!testerRequest) {
      return sendError(res, 409, "Tester request not found");
    }

    await prismaClient.$transaction(async (tx) => {
      await tx?.testerRelation?.update({
        where: {
          id: testerRequest?.id,
        },
        data: {
          status: "IN_PROGRESS",
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
          userId: tester_id || "",
          dashboardAndHubId: Number(hub_id),
          androidAppId: checkTester?.androidApp?.id,
          actionType: "JOIN_TEST_ACCEPT",
          description: `Your request to join testing for the application ${checkTester?.androidApp?.appName} has been accepted.`,
          ipAddress: req?.userIpAddress,
          userAgent: req?.userAgent,
          status: "SUCCESS",
        },
      });

      await tx?.notification?.create({
        data: {
          title: "Test Joining Request Accepted!",
          description: `Your request to join the application ${checkTester?.androidApp?.appName} has been approved. You may begin testing once the test phase has started.`,
          type: "NEW_JOIN_ACCEPT",
          userId: tester_id,
          isActive: true,
        },
      });
    });

    return sendSuccess(res, null, "Tester accepted for the testing");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "user",
      action: "acceptSubmittedHubAppTestingRequest",
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

export const rejectSubmittedHubAppTestingRequest = async (
  req: Request,
  res: Response,
) => {
  try {
    const { payload } = await req.body;
    if (!payload) {
      return sendError(res, 400, "Payload is required");
    }

    const { hub_id, tester_id, title, description, image, video } = payload;
    if (!hub_id || !tester_id || !title || !description) {
      return sendError(
        res,
        400,
        "hub_id, tester_id, rejection title and rejection description are required",
      );
    }

    const checkTester = await prismaClient?.dashboardAndHub?.findFirst({
      where: {
        id: Number(hub_id),
        status: "AVAILABLE",
        testerRelations: {
          some: {
            testerId: tester_id,
            dashboardAndHubId: Number(hub_id),
          },
        },
      },
      include: {
        androidApp: true,
      },
    });

    if (!checkTester || !checkTester?.totalTester) {
      return sendError(res, 409, "Submitted App not found");
    }

    const testerRequest = await prismaClient?.testerRelation?.findFirst({
      where: {
        testerId: tester_id,
        dashboardAndHubId: Number(hub_id),
        isActive: true,
        status: "PENDING",
      },
    });

    if (!testerRequest) {
      return sendError(res, 409, "Tester request not found");
    }

    const statusDetails: any = {
      title,
      description,
    };
    if (image) {
      statusDetails["image"] = image;
    }
    if (video) {
      statusDetails["video"] = video;
    }

    await prismaClient.$transaction(async (tx) => {
      await tx?.testerRelation?.update({
        where: {
          id: testerRequest?.id,
        },
        data: {
          status: "REJECTED",
          statusDetails: statusDetails,
        },
      });

      await tx?.userActivity?.create({
        data: {
          userId: req.userId || "",
          dashboardAndHubId: Number(hub_id),
          androidAppId: checkTester?.androidApp?.id,
          actionType: "JOIN_TEST_REJECTED",
          description: `Your request to join testing for the application ${checkTester?.androidApp?.appName} has been rejected.`,
          ipAddress: req?.userIpAddress,
          userAgent: req?.userAgent,
          status: "SUCCESS",
        },
      });

      await tx?.notification?.create({
        data: {
          title: "Test Joining Request Rejected!",
          description: `Your request to join the application ${checkTester?.androidApp?.appName} has been declined. Please check the app for more details.`,
          type: "REJECTED",
          userId: tester_id,
          isActive: true,
        },
      });
    });

    return sendSuccess(res, null, "Tester accepted for the testing");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "user",
      action: "rejectSubmittedHubAppTestingRequest",
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

export const addHubAppFeedback = async (req: Request, res: Response) => {
  try {
    const { payload } = await req.body;
    if (!payload) {
      return sendError(res, 400, "Payload is required");
    }

    const { message, type, priority, hub_id, image, video } = payload;
    if (!hub_id) {
      return sendError(res, 400, "Message, type and hub_id are required");
    }

    const checkApp = await prismaClient?.dashboardAndHub?.findFirst({
      where: {
        id: Number(hub_id),
        status: "IN_TESTING",
        testerRelations: {
          some: {
            testerId: req?.userId,
            dashboardAndHubId: Number(hub_id),
          },
        },
      },
      include: {
        androidApp: true,
      },
    });

    if (!checkApp) {
      return sendError(res, 409, "Application not found.");
    }

    await prismaClient.$transaction(async (tx) => {
      const feedbackData = await tx?.feedback?.create({
        data: {
          message,
          type,
          priority,
          testerId: req?.userId || "",
          dashboardAndHubId: Number(hub_id),
        },
      });

      if (image || video) {
        await tx?.media.create({
          data: {
            type: image ? "IMAGE" : "VIDEO",
            category: image ? "FEATURED_IMAGE" : "FEATURED_VIDEO",
            src: image ? image : video,
            feedbackId: feedbackData?.id,
          },
        });
      }

      await tx?.userActivity?.create({
        data: {
          userId: req.userId || "",
          dashboardAndHubId: Number(hub_id),
          androidAppId: checkApp?.androidApp?.id,
          feedbackId: feedbackData?.id,
          actionType: "GIVE_FEEDBACK",
          description: `Feedback added for app ${checkApp?.androidApp?.id} which is of ${type} type ${priority && `with ${priority} priority`} by ${req?.userId} tester.`,
          ipAddress: req?.userIpAddress,
          userAgent: req?.userAgent,
          status: "SUCCESS",
        },
      });

      return true;
    });

    return sendSuccess(res, null, "Feedback added successfully");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "user",
      action: "addHubAppTestingRequest",
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

export const updateHubAppFeedback = async (req: Request, res: Response) => {
  try {
    const { payload } = await req.body;
    if (!payload) {
      return sendError(res, 400, "Payload is required");
    }

    const { id, message, type, priority, image, video } = payload;
    if (!id) {
      return sendError(res, 400, "Feedback id is required");
    }

    const checkFeedback = await prismaClient?.feedback?.findFirst({
      where: {
        id: Number(id),
      },
      include: {
        media: true,
      },
    });

    if (!checkFeedback) {
      return sendError(res, 409, "Feedback not found");
    }

    if (checkFeedback?.testerId !== req?.userId) {
      return sendError(
        res,
        403,
        "You are not authorized to update this feedback",
      );
    }

    await prismaClient.$transaction(async (tx) => {
      await tx.feedback.update({
        where: { id: Number(id) },
        data: {
          message,
          type,
          priority,
        },
      });

      if (image || video) {
        const newSrc = image || video;
        const newType = image ? "IMAGE" : "VIDEO";
        const newCategory = image ? "FEATURED_IMAGE" : "FEATURED_VIDEO";

        if (checkFeedback.media) {
          // If media exists, check if we need to update
          if (checkFeedback.media.src !== newSrc) {
            // Delete old file from R2
            await deleteFunction({ url: checkFeedback.media.src });

            // Update DB
            await tx.media.update({
              where: { id: checkFeedback.media.id },
              data: {
                type: newType,
                category: newCategory,
                src: newSrc,
              },
            });
          }
        } else {
          // Create new media
          await tx.media.create({
            data: {
              type: newType,
              category: newCategory,
              src: newSrc,
              feedbackId: checkFeedback.id,
            },
          });
        }
      } else if (checkFeedback.media) {
        // If no image/video provided but media exists, it means user removed it
        // Delete old file from R2
        await deleteFunction({ url: checkFeedback.media.src });

        // Delete from DB
        await tx.media.delete({
          where: { id: checkFeedback.media.id },
        });
      }
    });

    return sendSuccess(res, null, "Feedback updated successfully");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "user",
      action: "updateHubAppFeedback",
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

export const deleteHubAppFeedback = async (req: Request, res: Response) => {
  try {
    const { id } = req?.params;

    if (!id) {
      return sendError(res, 400, "Please send feedback id");
    }

    const checkFeedback = await prismaClient?.feedback?.findFirst({
      where: {
        id: Number(id),
      },
      include: {
        media: true,
      },
    });
    if (!checkFeedback) {
      return sendError(res, 409, "Feedback not found");
    }

    await prismaClient.$transaction(async (tx) => {
      if (checkFeedback?.media) {
        await deleteFunction({
          url: checkFeedback?.media?.src || "",
        });

        await tx?.media?.delete({
          where: {
            id: checkFeedback?.media?.id,
          },
        });
      }

      await tx?.feedback?.delete({
        where: {
          id: checkFeedback?.id,
        },
      });

      const checkUserActivity = await tx.userActivity.findFirst({
        where: {
          feedbackId: checkFeedback?.id,
        },
      });

      if (checkUserActivity) {
        await tx?.userActivity?.delete({
          where: {
            id: checkUserActivity?.id,
          },
        });
      }

      return true;
    });

    return sendSuccess(res, null, "Feedback deleted successfully");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "user",
      action: "deleteHubAppFeedback",
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

export const submitDailyVerification = async (req: Request, res: Response) => {
  try {
    const { payload } = req.body;
    if (!payload) {
      return sendError(res, 400, "Payload is required");
    }

    const { hubId, proofImage, metaData } = payload;
    if (!hubId || !proofImage) {
      return sendError(res, 400, "hubId and proofImage are required");
    }

    const userId = req.userId;

    // 1. Find the relation (Using explicit composite key lookup or findFirst)
    // Since unique is on [testerId, dashboardAndHubId], but prisma naming might vary, findFirst is safer if composite naming is complex
    const relation = await prismaClient.testerRelation.findFirst({
      where: {
        testerId: userId!,
        dashboardAndHubId: Number(hubId),
      },
      include: {
        dashboardAndHub: true,
      },
    });

    if (!relation) {
      return sendError(res, 404, "You are not a tester for this app.");
    }

    if (relation.status !== "IN_PROGRESS") {
      return sendError(
        res,
        400,
        "Testing for this app is not currently in progress.",
      );
    }

    // 2. Determine Day Number
    const nextDay = relation.daysCompleted + 1;
    const totalDaysRequired = relation.dashboardAndHub?.totalDay || 14;

    if (nextDay > totalDaysRequired) {
      return sendError(
        res,
        400,
        "You have already completed the required testing days.",
      );
    }

    // 3. Duplicate Check
    const existing = await prismaClient.dailyTesterVerification.findFirst({
      where: {
        testerRelationId: relation.id,
        dayNumber: nextDay,
      },
    });

    if (existing) {
      return sendError(
        res,
        409,
        `Verification for day ${nextDay} already submitted.`,
      );
    }

    // 4. Create & Update
    await prismaClient.$transaction(async (tx) => {
      await tx.dailyTesterVerification.create({
        data: {
          testerRelationId: relation.id,
          dayNumber: nextDay,
          proofImageUrl: proofImage,
          status: "PENDING",
          verifiedAt: new Date(),
          metaData: JSON.stringify({
            ...metaData,
            ipAddress: req?.userIpAddress,
          }) || { ipAddress: req?.userIpAddress },
        },
      });

      let newStatus = relation.status;
      let completedAt = relation.completedAt;

      if (nextDay >= totalDaysRequired) {
        newStatus = "COMPLETED";
        completedAt = new Date();
      }

      await tx.testerRelation.update({
        where: { id: relation.id },
        data: {
          daysCompleted: { increment: 1 },
          lastActivityAt: new Date(),
          status: newStatus,
          completedAt: completedAt,
        },
      });

      // Log activity
      await tx.userActivity.create({
        data: {
          userId: userId!,
          dashboardAndHubId: Number(hubId),
          actionType: "COMPLETE_TEST",
          description: `Completed daily testing verification for Day ${nextDay}`,
          status: "SUCCESS",
        },
      });
    });

    return sendSuccess(
      res,
      { day: nextDay, status: "VERIFIED" },
      "Daily verification submitted successfully.",
    );
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "hub",
      action: "submitDailyVerification",
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

export const completeHostedApp = async (req: Request, res: Response) => {
  try {
    const { payload } = req.body;
    if (!payload?.appId) {
      return sendError(res, 400, "App ID is required");
    }

    const { appId } = payload;
    const userId = req.userId;

    const app = await prismaClient.dashboardAndHub.findFirst({
      where: {
        id: Number(appId),
        appOwnerId: userId,
      },
      include: {
        androidApp: true,
      },
    });

    if (!app) {
      return sendError(res, 404, "App not found or you are not the owner");
    }

    if (app.status === "COMPLETED") {
      return sendSuccess(res, null, "App is already completed");
    }

    await prismaClient.$transaction(async (tx) => {
      // Update App Status
      await tx.dashboardAndHub.update({
        where: { id: app.id },
        data: {
          status: "COMPLETED",
        },
      });

      // Log Activity
      await tx.userActivity.create({
        data: {
          userId: userId!,
          dashboardAndHubId: app.id,
          androidAppId: app.androidApp.id,
          actionType: "COMPLETE_TEST",
          description: `App owner completed the testing for ${app.androidApp.appName}`,
          status: "SUCCESS",
          ipAddress: req.userIpAddress,
          userAgent: req.userAgent,
        },
      });
    });

    return sendSuccess(res, null, "App marked as completed successfully");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "hub",
      action: "completeHostedApp",
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
