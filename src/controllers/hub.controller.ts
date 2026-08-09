import { type Request, type Response } from "express";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient, Prisma } from "@/lib/prisma";
import { normalizeR2Url } from "@/utils/helperFunctions";
import logger from "../utils/logger";
import type { DashboardAndHubStatus } from "@prisma/client";
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
        handshakeLevel: true,
        handshakeCompletedCount: true,
      },
    });

    const { getAvailableSlots, getActiveHandshakeCount } = await import(
      "@/lib/handshake"
    );
    const level = response?.handshakeLevel || 1;
    const slots = getAvailableSlots(level);
    const activeHandshakes = await getActiveHandshakeCount(userId);

    const appsSubmitted = await prismaClient.dashboardAndHub.count({
      where: { appOwnerId: userId, appType: "HANDSHAKE" },
    });

    const testersEngaged = await prismaClient.testerRelation.count({
      where: {
        dashboardAndHub: { appOwnerId: userId, appType: "HANDSHAKE" },
        status: { in: ["IN_PROGRESS", "COMPLETED"] },
      },
    });

    const testsCompleted = await prismaClient.testerRelation.count({
      where: {
        dashboardAndHub: { appOwnerId: userId, appType: "HANDSHAKE" },
        status: "COMPLETED",
      },
    });

    const statusCounts = await prismaClient.dashboardAndHub.groupBy({
      by: ["status"],
      where: { appOwnerId: userId, appType: "HANDSHAKE" },
      _count: { _all: true },
    });

    const availableApps = await prismaClient.dashboardAndHub.findMany({
      where: {
        status: "AVAILABLE",
        appOwnerId: { not: userId },
        appType: "HANDSHAKE",
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
      handshakeLevel: level,
      handshakeCompletedCount: response?.handshakeCompletedCount || 0,
      availableSlots: slots,
      activeHandshakes,
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
      promo_code,
      appType,
    } = payload;

    const isHandshake = appType === "HANDSHAKE";
    const isPaid = appType === "PAID";

    if (
      !app_name ||
      !app_url ||
      !app_logo_url ||
      !app_screenshot_url_1 ||
      !app_screenshot_url_2 ||
      !category_id ||
      !app_description ||
      minimum_android_version === undefined ||
      minimum_android_version === null ||
      total_tester === undefined ||
      total_tester === null ||
      total_days === undefined ||
      total_days === null ||
      ((!isHandshake && !isPaid) && (points_cost === undefined || points_cost === null))
    ) {
      return sendError(
        res,
        400,
        "app_url, app_name, app_logo_url, app_screenshot_url_1, app_screenshot_url_2, category_id, app_description, minimum_android_version, total_tester, total_days are required",
      );
    }

    const existingApp = await prismaClient.androidApp.findFirst({
      where: {
        OR: [
          { appName: app_name },
          { appLogoUrl: app_logo_url },
          { packageName: extractPackageName(app_url) || "" },
        ],
      },
    });

    if (existingApp) {
      if (existingApp.appName === app_name) {
        return sendError(
          res,
          400,
          "An app with this name already exists. Please use different name",
        );
      }
      if (existingApp.appLogoUrl === app_logo_url) {
        return sendError(
          res,
          400,
          "An app with this logo already exists. Please use different logo",
        );
      }
      return sendError(res, 400, "This app has already been submitted");
    }

    const package_name = extractPackageName(app_url);

    // Handshake testing is gated behind an active subscription (no points cost)
    if (isHandshake) {
      const { hasActiveHandshakeSubscription } = await import(
        "@/controllers/subscription.controller"
      );
      const active = await hasActiveHandshakeSubscription(req.userId!);
      if (!active) {
        return sendError(
          res,
          403,
          "An active handshake testing subscription is required to publish an app",
          undefined,
          undefined,
          { subscriptionRequired: true },
        );
      }
    }

    // Transparency Validation: Calculate cost on server to prevent tampering
    const baseTesterRate = 80;
    const baseDayRate = 10;
    const expectedCost =
      total_tester * baseTesterRate + total_days * baseDayRate;

    let final_points_cost = isHandshake ? 0 : points_cost;
    let appliedPromoCodeId: number | null = null;

    if (!isHandshake && !isPaid) {
      if (points_cost < expectedCost && !promo_code) {
        return sendError(
          res,
          400,
          `Invalid points cost. Expected at least ${expectedCost} points.`,
        );
      }

      if (promo_code) {
        const normalizedPromoCode = promo_code.trim().toUpperCase();
        if (!/^[A-Z0-9]{3,20}$/.test(normalizedPromoCode)) {
          return sendError(res, 400, "Promo code must be 3-20 alphanumeric characters");
        }

        const dbPromo = await prismaClient.promoCode.findUnique({
          where: { code: normalizedPromoCode },
        });

        if (!dbPromo || !dbPromo.isActive) {
          return sendError(res, 400, "Invalid or inactive promo code.");
        }

        if (dbPromo.maxUses && dbPromo.usedCount >= dbPromo.maxUses) {
          return sendError(res, 400, "Promo code usage limit reached.");
        }

        if (dbPromo.maxPerUser) {
          const usage = await prismaClient.userPromoUsage.findUnique({
            where: {
              userId_promoCodeId: {
                userId: req.userId!,
                promoCodeId: dbPromo.id,
              },
            },
          });

          if (usage && usage.usedCount >= dbPromo.maxPerUser) {
            return sendError(
              res,
              400,
              `You have already used this promo code ${dbPromo.maxPerUser} times.`,
            );
          }
        }

        if (dbPromo.discountType === "PERCENTAGE") {
          final_points_cost = Math.max(0, expectedCost * (1 - dbPromo.discountValue / 100));
        } else {
          final_points_cost = dbPromo.discountValue;
        }
        appliedPromoCodeId = dbPromo.id;
      }

      const userWallet = await prismaClient.userWallet.findUnique({
        where: { userId: req.userId! },
      });

      if (final_points_cost > 0 && (!userWallet || userWallet.totalPoints < final_points_cost)) {
        return sendError(res, 400, "Insufficient points balance.");
      }
    }

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
            appType: isPaid ? "PAID" : (isHandshake ? "HANDSHAKE" : "FREE"),
            currentTester: 0,
            totalTester: total_tester,
            currentDay: 0,
            totalDay: total_days,
            instructionsForTester: instruction_for_tester,
            costPoints: isHandshake ? 0 : (isPaid ? final_points_cost : 0),
            rewardPoints: 0,
            // averageTimeTesting
            minimumAndroidVersion: minimum_android_version,
            status: "IN_REVIEW",
            promoCodeId: isPaid ? appliedPromoCodeId : null,
          },
        });

        let walletData = null;
        if (!isHandshake && isPaid) {
          walletData = await tx?.userWallet?.update({
            where: {
              userId: req?.userId,
            },
            data: {
              totalPoints: {
                decrement: final_points_cost,
              },
            },
          });
        }

        if (appliedPromoCodeId) {
          await tx?.promoCode?.update({
            where: { id: appliedPromoCodeId },
            data: { usedCount: { increment: 1 } },
          });

          await tx.userPromoUsage.upsert({
            where: {
              userId_promoCodeId: {
                userId: req.userId!,
                promoCodeId: appliedPromoCodeId,
              },
            },
            create: {
              userId: req.userId!,
              promoCodeId: appliedPromoCodeId,
              usedCount: 1,
            },
            update: {
              usedCount: { increment: 1 },
            },
          });
        }

        if (isPaid) {
          await tx?.userTransaction?.create({
            data: {
              userId: req.userId || "",
              userWalletId: walletData?.id,
              dashboardAndHubId: dashboardAndHub?.id,
              action: "TESTING",
              points: final_points_cost,
              transactionType: "PURCHASE",
              status: "DEBIT",
              // PROMO_FREE when a promo made cost exactly 0; otherwise the user paid with POINTS
              paymentMethod: (appliedPromoCodeId && final_points_cost === 0) ? "PROMO_FREE" : "POINTS",
            },
          });
        }

        await tx?.userActivity?.create({
          data: {
            userId: req.userId || "",
            dashboardAndHubId: dashboardAndHub?.id,
            androidAppId: androidAppData?.id,
            actionType: "SUBMIT_APP",
            description: isPaid
              ? `${app_description} (Paid)`
              : isHandshake
                ? `${app_description} (Handshake)`
                : appliedPromoCodeId
                  ? `${app_description} (Promo: ${promo_code})`
                  : app_description,
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

    // Create a chat for every submitted app so the Testing Manager is
    // available immediately, including while the app is under review.
    if (dashboardAndHubResult) {
      try {
        const { createAppChatIfNotExists } = await import("@/lib/appChat");
        const appName = androidAppData?.appName || "Untitled App";
        await createAppChatIfNotExists({
          appId: dashboardAndHubResult.id,
          appOwnerId: req.userId || "",
          appName,
        });
      } catch (error) {
        logger.warn("Failed to create chat for app", error);
      }
    }

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
        appType: "HANDSHAKE",
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

export const resubmitHubApp = async (req: Request, res: Response) => {
  try {
    const { payload } = await req.body;
    if (!payload) {
      return sendError(res, 400, "Payload is required");
    }

    const {
      appId,
      app_name,
      app_url,
      app_logo_url,
      app_screenshot_url_1,
      app_screenshot_url_2,
      category_id,
      app_description,
      instruction_for_tester,
      minimum_android_version,
    } = payload;

    if (!appId) {
      return sendError(res, 400, "App ID is required");
    }

    const hubApp = await prismaClient.dashboardAndHub.findUnique({
      where: { id: Number(appId) },
      include: { androidApp: true },
    });

    if (!hubApp) {
      return sendError(res, 404, "Hub app not found");
    }

    if (hubApp.appOwnerId !== req.userId) {
      return sendError(res, 403, "You are not the owner of this app");
    }

    if (hubApp.status !== "REJECTED") {
      return sendError(res, 400, "Only rejected apps can be resubmitted");
    }

    const package_name = extractPackageName(app_url);

    const conflictApp = await prismaClient.androidApp.findFirst({
      where: {
        id: { not: hubApp.appId },
        OR: [
          { appName: app_name },
          { appLogoUrl: app_logo_url },
          { packageName: package_name || "" },
        ],
      },
    });

    if (conflictApp) {
      if (conflictApp.appName === app_name) {
        return sendError(res, 400, "An app with this name already exists.");
      }
      if (conflictApp.appLogoUrl === app_logo_url) {
        return sendError(res, 400, "An app with this logo already exists.");
      }
      return sendError(res, 400, "This app has already been submitted by someone else.");
    }

    const result = await prismaClient.$transaction(async (tx) => {
      await tx.androidApp.update({
        where: { id: hubApp.appId },
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

      const updatedHubApp = await tx.dashboardAndHub.update({
        where: { id: Number(appId) },
        data: {
          instructionsForTester: instruction_for_tester,
          minimumAndroidVersion: minimum_android_version,
          status: "IN_REVIEW",
          statusDetails: Prisma.DbNull,
        },
      });

      await tx.userActivity.create({
        data: {
          userId: req.userId || "",
          dashboardAndHubId: Number(appId),
          androidAppId: hubApp.appId,
          actionType: "UPDATE_PROFILE",
          description: `Resubmitted app: ${app_name}`,
          ipAddress: req?.userIpAddress,
          userAgent: req?.userAgent,
          status: "SUCCESS",
        },
      });

      return updatedHubApp;
    });

    return sendSuccess(res, result as any, "App resubmitted successfully");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "hub",
      action: "resubmitHubApp",
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
        appType: "HANDSHAKE",
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
      appType: "HANDSHAKE",
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

       // Convert Date objects to ISO strings for JSON serialization
       return {
         ...item,
         createdAt: item.createdAt?.toISOString() || null,
         updatedAt: item.updatedAt?.toISOString() || null,
         status,
         statusDetails: statusDetails
           ? JSON.parse(JSON.stringify(statusDetails))
           : null,
         testerRelations: item.testerRelations?.map(relation => ({
           ...relation,
           createdAt: relation.createdAt?.toISOString() || null,
           updatedAt: relation.updatedAt?.toISOString() || null,
           lastActivityAt: relation.lastActivityAt?.toISOString() || null,
           statusDetails: relation.statusDetails
             ? JSON.parse(JSON.stringify(relation.statusDetails))
             : null,
         })) || [],
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
        appType: "HANDSHAKE",
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
        dashboardAndHub: {
          appType: "HANDSHAKE",
        },
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
        } else if (appStatus === "COMPLETED") {
          // Ignore: app is completed, don't count in any active status
        } else {
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
    } else if (
      req?.role?.toUpperCase() !== "SUPER_ADMIN" &&
      req?.role?.toUpperCase() !== "ADMIN"
    ) {
      // Otherwise, only fetch the tester relation for the current user (unless Admin)
      testerRelationsCondition.testerId = req?.userId;
    }

    const hubAppDetails = await prismaClient?.dashboardAndHub?.findFirst({
      where: whereCondition,
      include: {
        androidApp: {
          include: {
            appCategory: true,
            ratings: true,
            reviews: {
              include: {
                user: {
                  select: {
                    name: true,
                    image: true,
                  },
                },
              },
              orderBy: {
                createdAt: "desc",
              },
            },
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
              select: { name: true, image: true },
            },
          },
        },
        testerRelations: {
          where: testerRelationsCondition,
          select: {
            id: true,
            testerId: true,
            isActive: true,
            status: true,
            statusDetails: true,
            assignmentSource: true,
            offeredAppId: true,
            dailyVerifications: true,
            daysCompleted: true,
            lastActivityAt: true,
            offeredApp: {
              include: {
                androidApp: true,
              },
            },
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

    const parsedStatusDetails = JSON.parse(
      JSON.stringify(hubAppDetails?.statusDetails),
    ) as Record<string, unknown> | null;
    if (parsedStatusDetails?.image) {
      parsedStatusDetails.image = normalizeR2Url(
        parsedStatusDetails.image as string,
      );
    }
    if (parsedStatusDetails?.video) {
      parsedStatusDetails.video = normalizeR2Url(
        parsedStatusDetails.video as string,
      );
    }

    const result: any = {
      ...hubAppDetails,
      statusDetails: parsedStatusDetails,
      testerRelations:
        hubAppDetails?.testerRelations &&
        hubAppDetails?.testerRelations?.length > 0
          ? hubAppDetails?.testerRelations?.map((item) => {
              const parsed = JSON.parse(
                JSON.stringify(item?.statusDetails),
              ) as Record<string, unknown> | null;
              if (parsed?.image) {
                parsed.image = normalizeR2Url(parsed.image as string);
              }
              if (parsed?.video) {
                parsed.video = normalizeR2Url(parsed.video as string);
              }
              return {
                ...item,
                statusDetails: parsed,
                dailyVerifications: item?.dailyVerifications?.map(
                  (item2) => ({
                    ...item2,
                    metaData: JSON.parse(JSON.stringify(item2?.metaData)),
                  }),
                ),
              };
            })
          : [],
    };

    const appRatings = (hubAppDetails?.androidApp?.ratings || []).filter(
      (r) => r.ratingType === "APP",
    );
    result.averageRating =
      appRatings.length > 0
        ? appRatings.reduce((sum: number, r) => sum + r.rating, 0) / appRatings.length
        : 0;

    if (result.testerRelations && result.testerRelations.length > 0) {
      result.testerRelations = result.testerRelations.map((tr: any) => {
        const rating =
          hubAppDetails?.androidApp?.ratings?.find(
            (r) => r.userId === tr.testerId,
          )?.rating || 0;
        return {
          ...tr,
          tester: {
            ...tr.tester,
            ratings: [{ rating }],
          },
        };
      });
    }

    // Compute current day from testingStartDate
    const now = new Date();
    const startDate = hubAppDetails?.testingStartDate;
    const totalDay = hubAppDetails?.totalDay || 0;
    if (startDate && totalDay > 0) {
      const elapsed = Math.floor(
        (now.getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      result.currentDay = Math.min(elapsed + 1, totalDay);
    }

    // Add payment info for Admins
    const userRole = req?.role?.toUpperCase();
    if (userRole === "ADMIN" || userRole === "SUPER_ADMIN") {
      // Use persisted costMoney if it exists (the new robust way)
      if (hubAppDetails?.costMoney) {
        result.paymentInfo = {
          amountPaid: hubAppDetails.costMoney,
          currency: "INR", // Default currency as per user request
          isPersisted: true,
        };
      } else {
        // Fallback for legacy data (older submissions that don't have costMoney)
        const submissionTx = await prismaClient.userTransaction.findFirst({
          where: {
            dashboardAndHubId: Number(id),
            action: "APP_SUBMISSION",
          },
          orderBy: { createdAt: "desc" },
        });

        if (submissionTx) {
          const lastOrder = await prismaClient.order.findFirst({
            where: {
              userId: (hubAppDetails as any)?.appOwnerId,
              status: "PAID",
            },
            orderBy: { createdAt: "desc" },
          });

          if (
            lastOrder &&
            lastOrder.packageCount &&
            lastOrder.packageCount > 0
          ) {
            const unitPrice = lastOrder.amount / 100 / lastOrder.packageCount;
            result.paymentInfo = {
              amountPaid: unitPrice * (submissionTx.package || 1),
              currency: lastOrder.currency,
              isPersisted: false,
            };
          }
        }
      }

      // Add persisted rewardMoney if available
      if (hubAppDetails?.rewardMoney) {
        result.rewardMoney = hubAppDetails.rewardMoney;
      }
    }

    // Handshake enrichment: attach partner + block status for the viewing tester
    if (hubAppDetails?.appType === "HANDSHAKE") {
      const myRelation = (result.testerRelations || []).find(
        (tr: any) => tr.testerId === req.userId,
      );
      if (myRelation) {
        const link = await prismaClient.handshakeLink.findFirst({
          where: {
            status: "ACTIVE",
            OR: [
              { relationAId: myRelation.id },
              { relationBId: myRelation.id },
            ],
          },
          include: {
            relationA: {
              include: {
                dashboardAndHub: {
                  include: { androidApp: true, appOwner: true },
                },
              },
            },
            relationB: {
              include: {
                dashboardAndHub: {
                  include: { androidApp: true, appOwner: true },
                },
              },
            },
          },
        });
        if (link) {
          const { processSkipPenalty, getBlockStatus } = await import(
            "@/lib/handshake"
          );
          await processSkipPenalty(link.id);
          const refreshed = await prismaClient.handshakeLink.findUnique({
            where: { id: link.id },
          });
          if (refreshed) {
            const isA = link.relationAId === myRelation.id;
            const block = await getBlockStatus(refreshed, isA ? "A" : "B");
            const partnerRelation = isA
              ? link.relationB
              : link.relationA;
            result.handshake = {
              linkId: link.id,
              isBlocked: block.isBlocked,
              blockedUntil: block.blockedUntil,
              partnerApp: partnerRelation.dashboardAndHub?.androidApp,
              partnerOwner: partnerRelation.dashboardAndHub?.appOwner,
            };
          }
        }
      }
    }

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

    const { hub_id, offered_app_id } = payload;
    if (!hub_id) {
      return sendError(res, 400, "hub_id is required");
    }

    const checkTester = await prismaClient?.dashboardAndHub?.findFirst({
      where: {
        id: Number(hub_id),
        status: "AVAILABLE",
        appOwnerId: { not: req?.userId },
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

    const isHandshake = checkTester.appType === "HANDSHAKE";

    // Handshake-specific validation
    if (isHandshake) {
      if (!offered_app_id) {
        return sendError(
          res,
          400,
          "offered_app_id (the app you offer in return) is required for handshake testing",
        );
      }

      const offeredApp = await prismaClient?.dashboardAndHub?.findFirst({
        where: {
          id: Number(offered_app_id),
          appOwnerId: req.userId,
          status: "AVAILABLE",
          appType: "HANDSHAKE",
        },
      });

      if (!offeredApp) {
        return sendError(
          res,
          400,
          "You can only offer one of your own published (available) handshake apps",
        );
      }

      // Prevent duplicate active handshake between the same pair of apps
      const existingRelation = await prismaClient.testerRelation.findFirst({
        where: {
          testerId: req.userId!,
          dashboardAndHubId: Number(hub_id),
          OR: [
            { handshakeLinkAsA: { is: { status: "ACTIVE" } } },
            { handshakeLinkAsB: { is: { status: "ACTIVE" } } },
          ],
        },
      });

      if (existingRelation) {
        return sendError(
          res,
          409,
          "You already have an active handshake with this app",
        );
      }

      // Slot availability check
      const { getAvailableSlots, getActiveHandshakeCount } = await import(
        "@/lib/handshake"
      );
      const user = await prismaClient.user.findUnique({
        where: { id: req.userId! },
        select: { handshakeLevel: true },
      });
      const level = user?.handshakeLevel || 1;
      const slots = getAvailableSlots(level);
      const activeCount = await getActiveHandshakeCount(req.userId!);
      if (activeCount >= slots) {
        return sendError(
          res,
          409,
          `You have reached your handshake limit (${slots} slots at level ${level}). Level up to unlock more.`,
          undefined,
          undefined,
          { slotsExhausted: true },
        );
      }
    }

    await prismaClient.$transaction(async (tx) => {
      await tx?.testerRelation?.create({
        data: {
          testerId: req?.userId || "",
          dashboardAndHubId: Number(hub_id),
          offeredAppId: isHandshake ? Number(offered_app_id) : null,
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
          description: isHandshake
            ? `Your handshake request for ${checkTester?.androidApp?.appName} has been sent successfully.`
            : `Your request to join testing for ${checkTester?.androidApp?.appName} has been sent successfully.`,
          ipAddress: req?.userIpAddress,
          userAgent: req?.userAgent,
          status: "SUCCESS",
        },
      });

      await tx?.notification?.create({
        data: {
          title: "New Tester Join Request!",
          description: isHandshake
            ? `A tester requested a handshake for your ${checkTester?.androidApp?.appName} testing program.`
            : `A new tester requested to join your ${checkTester?.androidApp?.appName} testing program.`,
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

    const isHandshake = checkTester.appType === "HANDSHAKE";

    // For handshake, the requester must have offered one of their apps in return.
    let offeredApp: any = null;
    if (isHandshake) {
      if (!testerRequest.offeredAppId) {
        return sendError(
          res,
          400,
          "This handshake request is missing the offered app",
        );
      }
      offeredApp = await prismaClient?.dashboardAndHub?.findFirst({
        where: {
          id: testerRequest.offeredAppId,
          appOwnerId: tester_id,
          status: "AVAILABLE",
          appType: "HANDSHAKE",
        },
      });
      if (!offeredApp) {
        return sendError(
          res,
          400,
          "The offered app is no longer available for handshake",
        );
      }

      // The app owner will also become a tester of the offered app, so enforce
      // their slot limit too. This prevents an owner from being pushed past
      // their level cap just by accepting requests.
      const { getAvailableSlots, getActiveHandshakeCount } = await import(
        "@/lib/handshake"
      );
      const ownerUser = await prismaClient.user.findUnique({
        where: { id: checkTester.appOwnerId },
        select: { handshakeLevel: true },
      });
      const ownerLevel = ownerUser?.handshakeLevel || 1;
      const ownerSlots = getAvailableSlots(ownerLevel);
      const ownerActive = await getActiveHandshakeCount(checkTester.appOwnerId);
      if (ownerActive >= ownerSlots) {
        return sendError(
          res,
          409,
          `The app owner has reached their handshake limit (${ownerSlots} slots at level ${ownerLevel}). Complete an existing handshake or level up to accept more.`,
          undefined,
          undefined,
          { slotsExhausted: true },
        );
      }
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

      let reciprocalRelationId: number | null = null;
      if (isHandshake && offeredApp) {
        // App owner (checkTester.appOwnerId) becomes a tester of the requester's offered app.
        const reciprocal = await tx?.testerRelation?.create({
          data: {
            testerId: checkTester.appOwnerId,
            dashboardAndHubId: offeredApp.id,
            isActive: true,
            status: "IN_PROGRESS",
            daysCompleted: 0,
          },
        });
        reciprocalRelationId = reciprocal?.id ?? null;

        // Increment tester count on the offered app too.
        const offeredDataValues: any = { currentTester: { increment: 1 } };
        if (offeredApp.currentTester + 1 === offeredApp.totalTester) {
          offeredDataValues.status = "IN_TESTING";
          const now = new Date();
          offeredDataValues.testingStartDate = now;
          offeredDataValues.testingEndDate = new Date(
            now.getTime() + (offeredApp.totalDay || 14) * 24 * 60 * 60 * 1000
          );
        }
        await tx?.dashboardAndHub?.update({
          where: { id: offeredApp.id },
          data: offeredDataValues,
        });
      }

      const dataValues: any = { currentTester: { increment: 1 } };
      if (checkTester.currentTester + 1 === checkTester.totalTester) {
        dataValues.status = "IN_TESTING";
        const now = new Date();
        dataValues.testingStartDate = now;
        dataValues.testingEndDate = new Date(
          now.getTime() + (checkTester.totalDay || 14) * 24 * 60 * 60 * 1000
        );
      }

      await tx?.dashboardAndHub?.update({
        where: {
          id: Number(hub_id),
        },
        data: dataValues,
      });

      // Create the handshake link tying the two relations together
      if (isHandshake && reciprocalRelationId) {
        await tx?.handshakeLink?.create({
          data: {
            relationAId: testerRequest.id,
            relationBId: reciprocalRelationId,
            status: "ACTIVE",
          },
        });
      }

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
      statusDetails["image"] = normalizeR2Url(image);
    }
    if (video) {
      statusDetails["video"] = normalizeR2Url(video);
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
            src: normalizeR2Url(image ? image : video),
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
        const newSrc = normalizeR2Url(image || video);
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
    if (!hubId) {
      return sendError(res, 400, "hubId is required");
    }

    const userId = req.userId;

    // 1. Find the relation
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

    // Now that we have relation, we can check if it's a FREE app and proofImage is missing
    if (relation.dashboardAndHub?.appType !== "PAID" && !proofImage) {
      return sendError(
        res,
        400,
        "proofImage is required for handshake testing.",
      );
    }

    if (relation.status !== "IN_PROGRESS" || relation.dashboardAndHub?.status !== "IN_TESTING") {
      return sendError(
        res,
        400,
        "Testing for this app is not currently in progress.",
      );
    }

    // Handshake: enforce the accumulative skip penalty before allowing submission
    if (relation.dashboardAndHub?.appType === "HANDSHAKE") {
      const link = await prismaClient.handshakeLink.findFirst({
        where: {
          status: "ACTIVE",
          OR: [{ relationAId: relation.id }, { relationBId: relation.id }],
        },
      });

      if (link) {
        const { processSkipPenalty } = await import("@/lib/handshake");
        await processSkipPenalty(link.id);

        const refreshed = await prismaClient.handshakeLink.findUnique({
          where: { id: link.id },
        });
        if (refreshed) {
          const now = new Date();
          const isRelationA = refreshed.relationAId === relation.id;
          const blockedUntil = isRelationA
            ? refreshed.aBlockedUntil
            : refreshed.bBlockedUntil;
          if (blockedUntil && blockedUntil > now) {
            return sendError(
              res,
              423,
              "Your testing partner didn't test your app, so you are temporarily blocked from testing theirs.",
              undefined,
              undefined,
              {
                blocked: true,
                blockedUntil,
                reason:
                  "Your partner skipped testing. You are paused from testing their app until the penalty is served.",
              },
            );
          }
        }
      }
    }

    // 2. Determine Day Number
    const nextDay = relation.daysCompleted + 1;
    const totalDaysRequired = relation.dashboardAndHub?.totalDay || 14;
    const completedNow = nextDay >= totalDaysRequired;

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
          proofImageUrl: normalizeR2Url(proofImage),
          status: "VERIFIED", // Auto-approved as requested
          verifiedAt: new Date(),
          metaData:
            JSON.stringify({
              ...metaData,
              ipAddress: req?.userIpAddress,
            }) || JSON.stringify({ ipAddress: req?.userIpAddress }),
        },
      });

      let newStatus = relation.status;
      let completedAt = relation.completedAt;

      if (nextDay >= totalDaysRequired) {
        newStatus = "COMPLETED";
        completedAt = new Date();

        // 5. Notify App Owner
        await tx.notification.create({
          data: {
            title: "Tester Completed!",
            description: `A tester has completed the full 14-day testing period for your app.`,
            type: "TEST_COMPLETED",
            userId: relation.dashboardAndHub?.appOwnerId || "",
            isActive: true,
          },
        });
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
          description:
            newStatus === "COMPLETED"
              ? "Completed full 14-day testing period"
              : `Completed daily testing verification for Day ${nextDay}`,
          status: "SUCCESS",
        },
      });
    });

    // After a successful submission, finalize the handshake if both sides completed
    if (
      completedNow &&
      relation.dashboardAndHub?.appType === "HANDSHAKE"
    ) {
      const link = await prismaClient.handshakeLink.findFirst({
        where: {
          status: "ACTIVE",
          OR: [{ relationAId: relation.id }, { relationBId: relation.id }],
        },
      });
      if (link) {
        const { checkAndFinalizeHandshake } = await import("@/lib/handshake");
        await checkAndFinalizeHandshake(link.id);
      }
    }

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

    const isHandshake = app.appType === "HANDSHAKE";

    await prismaClient.$transaction(async (tx) => {
      // Update App Status to COMPLETED
      const updatedApp = await tx.dashboardAndHub.update({
        where: { id: app.id },
        data: {
          status: "COMPLETED",
        },
      });

      // Find all testers who COMPLETED the test cycle for this app
      const testersToReward = await tx.testerRelation.findMany({
        where: {
          dashboardAndHubId: app.id,
          status: "COMPLETED",
        },
      });

      const rewardAmount = app.rewardPoints || 0;

      // Handshake testing is a barter system: no points are awarded.
      if (rewardAmount > 0 && testersToReward.length > 0) {
        for (const rel of testersToReward) {
          // Skip admin-assigned testers ,  they earn nothing on-platform
          if (rel.assignmentSource === "ADMIN_ASSIGNED") continue;
          const wallet = await tx.userWallet.upsert({
            where: { userId: rel.testerId },
            create: {
              userId: rel.testerId,
              totalPoints: rewardAmount,
              totalPackages: 0,
            },
            update: {
              totalPoints: { increment: rewardAmount },
            },
          });

          await tx.userTransaction.create({
            data: {
              userId: rel.testerId,
              userWalletId: wallet.id,
              dashboardAndHubId: app.id,
              action: "TESTING",
              points: rewardAmount,
              transactionType: "EARNING",
              status: "CREDIT",
            },
          });

          // Notify Tester
          await tx.notification.create({
            data: {
              title: "Points Awarded!",
              description: `You've earned ${rewardAmount} points for completing the testing of "${app.androidApp.appName}".`,
              type: "POINTS_AWARDED",
              userId: rel.testerId,
              isActive: true,
            },
          });
        }
      }

      // Mark remaining IN_PROGRESS testers as COMPLETED
      await tx.testerRelation.updateMany({
        where: {
          dashboardAndHubId: app.id,
          status: "IN_PROGRESS",
        },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
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

    // For handshake apps, finalize any links where both sides just completed
    if (isHandshake) {
      const links = await prismaClient.handshakeLink.findMany({
        where: {
          status: "ACTIVE",
          OR: [
            { relationA: { dashboardAndHubId: app.id } },
            { relationB: { dashboardAndHubId: app.id } },
          ],
        },
      });
      const { checkAndFinalizeHandshake } = await import("@/lib/handshake");
      for (const link of links) {
        await checkAndFinalizeHandshake(link.id);
      }
    }

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

export const validatePromoCode = async (req: Request, res: Response) => {
  try {
    const { payload } = await req.body;
    const code = payload?.code || req.body?.code;
    if (!code) {
      return sendError(res, 400, "Promo code is required");
    }

    const normalizedCode = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,20}$/.test(normalizedCode)) {
      return sendError(res, 400, "Promo code must be 3-20 alphanumeric characters");
    }

    const promoCode = await prismaClient?.promoCode?.findUnique({
      where: { code: normalizedCode },
    });

    if (!promoCode || !promoCode.isActive) {
      return sendError(res, 400, "Invalid or inactive promo code.");
    }

    if (promoCode.maxUses && promoCode.usedCount >= promoCode.maxUses) {
      return sendError(res, 400, "Promo code usage limit reached.");
    }

    if (promoCode.maxPerUser) {
      const usage = await prismaClient.userPromoUsage.findUnique({
        where: {
          userId_promoCodeId: {
            userId: req.userId!,
            promoCodeId: promoCode.id,
          },
        },
      });

      if (usage && usage.usedCount >= promoCode.maxPerUser) {
        return sendError(
          res,
          400,
          `You have already used this promo code ${promoCode.maxPerUser} times.`,
        );
      }
    }

    return sendSuccess(
      res,
      { discountValue: promoCode.discountValue, discountType: promoCode.discountType },
      "Promo code is valid",
    );
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "hub",
      action: "validatePromoCode",
      targetId: req?.userId || "",
      result: "fail",
      reason: error instanceof Error ? error.message : "Unknown error",
      ip: req?.userIpAddress || "",
      ua: req?.userAgent || "",
    };
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Unknown error",
      auditLogPayloadFail,
    );
  }
};

export const startTestingHubApp = async (req: Request, res: Response) => {
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

    if (app.status === "IN_TESTING") {
      return sendSuccess(res, null, "App is already in testing");
    }

    if (app.status !== "AVAILABLE") {
      return sendError(
        res,
        400,
        `Cannot start testing when app status is ${app.status}`,
      );
    }

    const now = new Date();
    const updatedApp = await prismaClient.dashboardAndHub.update({
      where: { id: app.id },
      data: {
        status: "IN_TESTING",
        testingStartDate: now,
        testingEndDate: new Date(
          now.getTime() + (app.totalDay || 14) * 24 * 60 * 60 * 1000
        ),
      },
    });

    return sendSuccess(
      res,
      updatedApp as any,
      "App testing started successfully",
    );
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "hub",
      action: "startTestingHubApp",
      targetId: req?.userId || "",
      result: "fail",
      reason: error instanceof Error ? error.message : "Unknown error",
      ip: req?.userIpAddress || "",
      ua: req?.userAgent || "",
    };
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Unknown error",
      auditLogPayloadFail,
    );
  }
};
