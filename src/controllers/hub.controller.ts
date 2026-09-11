import { type Request, type Response } from "express";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient, Prisma } from "@/lib/prisma";
import { normalizeR2Url } from "@/utils/helperFunctions";
import logger from "../utils/logger";
import type { DashboardAndHubStatus } from "@prisma/client";
import { deleteFunction } from "./r2.controller";
import { extractPackageName } from "@/services/common";
import { cancelPendingRequestsForCampaign } from "@/lib/handshake";

export const getHubStats = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    if (!userId) {
      return sendError(res, 400, "UserId not found");
    }
    const response = await prismaClient.user.findUnique({
      where: { id: userId },
      select: {
        handshakeLevel: true,
        handshakeCompletedCount: true,
      },
    });

    const { getAvailableSlots, getActiveHandshakeCount } = await import(
      "@/lib/handshake"
    );
    const level = response?.handshakeLevel ?? 0;
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
          // P2.6: only active participations hide a campaign (re-handshake
          // after completion stays discoverable).
          none: {
            testerId: userId,
            status: { in: ["PENDING", "IN_PROGRESS", "MISSED", "PENALIZED"] },
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
      appType,
    } = payload;

    const isHandshake = appType === "HANDSHAKE";
    const isPaid = appType === "PAID";

    // P1.5: server-side penalty gate (spec §30) —  penalized users may not
    // publish new handshake campaigns until they serve their tasks.
    if (isHandshake) {
      const { getPenaltyBlockState } = await import("@/lib/handshake");
      const { blocked, openCount } = await getPenaltyBlockState(req.userId!);
      if (blocked) {
        return sendError(
          res,
          423,
          "You have an active penalty that must be served before publishing new handshake apps",
          undefined,
          undefined,
          {
            blocked: true,
            reason: "Active penalty —  see /handshake-testing/penalty",
            penaltyCount: openCount,
          },
        );
      }
    }

    // Spec §5.1: handshake apps only require App Name, Icon, Link.
    // All other fields (description, screenshots, category, minimum Android
    // version) are optional for HANDSHAKE — category defaults to "Other"
    // and minimum Android version to 8.0 below.
    // Spec §23: testing period defaults to 16 days for handshake.
    if (isHandshake) {
      if (!app_name || !app_url || !app_logo_url) {
        return sendError(
          res,
          400,
          "For Handshake apps, app_name, app_url, app_logo_url are required",
        );
      }
    } else if (
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
      total_days === null
    ) {
      return sendError(
        res,
        400,
        "app_url, app_name, app_logo_url, app_screenshot_url_1, app_screenshot_url_2, category_id, app_description, minimum_android_version, total_tester, total_days are required",
      );
    }

    const existingPackageName = extractPackageName(app_url);
    const duplicateCampaign = await prismaClient.dashboardAndHub.findFirst({
      where: {
        appType,
        status: { not: "DRAFT" },
        androidApp: {
          OR: [
            { appName: app_name },
            { appLogoUrl: app_logo_url },
            ...(existingPackageName
              ? [{ packageName: existingPackageName }]
              : []),
          ],
        },
      },
      include: { androidApp: true },
    });

    if (duplicateCampaign) {
      if (duplicateCampaign.androidApp.appName === app_name) {
        return sendError(
          res,
          400,
          "An app with this name already exists in this testing type. Please use a different name",
        );
      }
      if (duplicateCampaign.androidApp.appLogoUrl === app_logo_url) {
        return sendError(
          res,
          400,
          "An app with this logo already exists in this testing type. Please use a different logo",
        );
      }
      return sendError(
        res,
        400,
        "This app has already been submitted in this testing type",
      );
    }

    const package_name = extractPackageName(app_url);

    // S9: the legacy points economy (points cost validation, promo-discounted
    // points pricing, wallet balance gate, and the points debit) has been
    // removed — the platform runs on HANDSHAKE barter + Pro packages/money.

    const { androidAppData, dashboardAndHub } = await prismaClient.$transaction(
      async (tx) => {
        // Spec §5.1: category optional for HANDSHAKE — default to "Other".
        let resolvedCategoryId = Number(category_id);
        if (isHandshake && !category_id) {
          const otherCategory = await tx?.appCategory?.findFirst({
            where: { name: "Other" },
            select: { id: true },
          });
          if (!otherCategory) {
            throw new Error(
              "No category provided and no default 'Other' category exists",
            );
          }
          resolvedCategoryId = otherCategory.id;
        }
        const androidAppData = await tx?.androidApp?.create({
          data: {
            appName: app_name,
            appLogoUrl: app_logo_url,
            // Spec §5.1: screenshots optional for HANDSHAKE
            appScreenshotUrl1: isHandshake
              ? (app_screenshot_url_1 || "")
              : app_screenshot_url_1,
            appScreenshotUrl2: isHandshake
              ? (app_screenshot_url_2 || "")
              : app_screenshot_url_2,
            appCategoryId: resolvedCategoryId,
            packageName: package_name || "",
            description: isHandshake ? (app_description || "") : app_description,
          },
        });

        // Spec: handshake campaigns are FIXED at 16 testers x 16 days.
        // Client-sent values are ignored; admins can adjust post-approval.
        let resolvedTotalDays =
          total_days !== undefined && total_days !== null
            ? total_days
            : 14;
        let resolvedTotalTester =
          total_tester !== undefined && total_tester !== null
            ? Number(total_tester)
            : 0;
        if (isHandshake) {
          resolvedTotalTester = 16;
          resolvedTotalDays = 16;
        }

        const dashboardAndHub = await tx?.dashboardAndHub?.create({
          data: {
            appId: androidAppData?.id,
            appOwnerId: req?.userId || "",
            appType: isPaid ? "PAID" : (isHandshake ? "HANDSHAKE" : "FREE"),
            currentTester: 0,
            totalTester: resolvedTotalTester,
            currentDay: 0,
            totalDay: resolvedTotalDays,
            instructionsForTester: instruction_for_tester,
            // averageTimeTesting
            // Spec §5.1: minimum Android version optional for HANDSHAKE
            // (defaults to 8.0).
            minimumAndroidVersion:
              minimum_android_version !== undefined &&
              minimum_android_version !== null
                ? minimum_android_version
                : isHandshake
                  ? 8.0
                  : minimum_android_version,
            status: "IN_REVIEW",
          },
        });

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

    // Create a chat for every Pro (PAID) submitted app so the Testing
    // Manager is available immediately, including while the app is under
    // review. Handshake/Free apps do not get an auto-created chat.
    if (dashboardAndHubResult && dashboardAndHubResult.appType === "PAID") {
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

    // P2.9: the owner-facing "testing" bucket must include the full v2
    // lifecycle —  WAITING_FOR_PARTNERS (24h window) and TESTING_ACTIVE
    // campaigns were previously invisible in every tab of My Submissions,
    // leaving owners without UI access to testers/chat/completion.
    const statusFilter =
      type === "IN_TESTING"
        ? {
            in: [
              "IN_TESTING",
              "WAITING_FOR_PARTNERS",
              "TESTING_ACTIVE",
            ] as DashboardAndHubStatus[],
          }
        : (type as DashboardAndHubStatus);

    const hubSubmittedApp = await prismaClient?.dashboardAndHub?.findMany({
      where: {
        appOwnerId: req?.userId,
        status: statusFilter,
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

    const conflictCampaign = await prismaClient.dashboardAndHub.findFirst({
      where: {
        id: { not: hubApp.id },
        appType: hubApp.appType,
        status: { not: "DRAFT" },
        androidApp: {
          OR: [
            { appName: app_name },
            { appLogoUrl: app_logo_url },
            ...(package_name ? [{ packageName: package_name }] : []),
          ],
        },
      },
      include: { androidApp: true },
    });

    if (conflictCampaign) {
      if (conflictCampaign.androidApp.appName === app_name) {
        return sendError(
          res,
          400,
          "An app with this name already exists in this testing type.",
        );
      }
      if (conflictCampaign.androidApp.appLogoUrl === app_logo_url) {
        return sendError(
          res,
          400,
          "An app with this logo already exists in this testing type.",
        );
      }
      return sendError(
        res,
        400,
        "This app has already been submitted in this testing type by someone else.",
      );
    }

    const result = await prismaClient.$transaction(async (tx) => {
      // Mirror the create-side handshake optional defaults so an edit with
      // empty category/minAndroid doesn't 400/500 with an FK violation or
      // null write. (Spec §5.1: handshake apps need only name/icon/link.)
      const isHandshake = hubApp.appType === "HANDSHAKE";
      let resolvedCategoryId = Number(category_id);
      if (isHandshake && !category_id) {
        const otherCategory = await tx.appCategory.findFirst({
          where: { name: "Other" },
          select: { id: true },
        });
        if (!otherCategory) {
          throw new Error(
            "No category provided and no default 'Other' category exists",
          );
        }
        resolvedCategoryId = otherCategory.id;
      }
      const resolvedMinAndroid =
        minimum_android_version !== undefined &&
        minimum_android_version !== null
          ? minimum_android_version
          : isHandshake
            ? 8.0
            : minimum_android_version;

      await tx.androidApp.update({
        where: { id: hubApp.appId },
        data: {
          appName: app_name,
          appLogoUrl: app_logo_url,
          appScreenshotUrl1: isHandshake
            ? (app_screenshot_url_1 || "")
            : app_screenshot_url_1,
          appScreenshotUrl2: isHandshake
            ? (app_screenshot_url_2 || "")
            : app_screenshot_url_2,
          appCategoryId: resolvedCategoryId,
          packageName: package_name || "",
          description: app_description,
        },
      });

      const updatedHubApp = await tx.dashboardAndHub.update({
        where: { id: Number(appId) },
        data: {
          instructionsForTester: instruction_for_tester,
          minimumAndroidVersion: resolvedMinAndroid,
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
      // P2.9: fold the v2 waiting/active states into IN_TESTING so owner
      // dashboards counting `IN_TESTING + AVAILABLE` see the whole lifecycle.
      if (
        item.status === "WAITING_FOR_PARTNERS" ||
        item.status === "TESTING_ACTIVE"
      ) {
        result["IN_TESTING"] += item._count._all;
        continue;
      }
      if (item.status in result) {
        result[item.status] = item._count._all;
      }
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

/**
 * Compute the daysCompleted for the CURRENT handshake cycle only.
 *
 * Why this exists: `TesterRelation` rows are unique per (tester, campaign)
 * and get reused across cycles. Fresh restarts (adminRestartApp and manual
 * TESTING_ACTIVE entries) reset per-cycle state via resetHandshakeCycleState,
 * but legacy rows and manual admin edits can still carry previous-cycle
 * `daysCompleted`/`dailyVerifications`. Counting proofs with
 * `verifiedAt >= testingStartDate` gives the true current-cycle count
 * regardless of what the raw row value says.
 *
 * Pre-start states (campaign AVAILABLE / WAITING_FOR_PARTNERS) have no
 * current-cycle progress by definition, so we always return 0 there.
 * When `testingStartDate` is missing on an active campaign we fall back to
 * the stored `daysCompleted` (legacy / edge cases).
 */
function currentCycleDays(
  storedDaysCompleted: number,
  verifications: { verifiedAt: Date | null }[] | undefined,
  campaignStatus: string,
  testingStartDate: Date | string | null | undefined,
): number {
  if (campaignStatus === "AVAILABLE" || campaignStatus === "WAITING_FOR_PARTNERS") {
    return 0;
  }
  if (!testingStartDate) {
    return storedDaysCompleted;
  }
  const start = new Date(testingStartDate).getTime();
  let count = 0;
  for (const v of verifications || []) {
    if (!v.verifiedAt) continue;
    if (new Date(v.verifiedAt).getTime() >= start) count += 1;
  }
  return count;
}

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
      // P2.6: exclude only ACTIVE participations —  campaigns where the user
      // has a COMPLETED/REJECTED/REPLACED/DROPPED history stay discoverable
      // so spec §11 re-handshake-after-completion works from the Available
      // tab (previously `none: { testerId }` hid them forever).
      whereCond.testerRelations = {
        none: {
          testerId: req?.userId,
          status: { in: ["PENDING", "IN_PROGRESS", "MISSED", "PENALIZED"] },
        },
      };
      // S8-G3: hide campaigns I've sent a still-pending request for, so the
      // next handshake goes to a fresh developer (spec: "their campaign will
      // be hidden from the handshake page"). This is the only filter on
      // incoming/offered requests we keep — campaigns that already sent ME
      // an incoming request (handshakeRequestsAsOffer) stay visible per
      // spec so they can be boosted to the top of the list.
      whereCond.handshakeRequestsAsTarget = {
        none: {
          fromUserId: req?.userId,
          status: "PENDING",
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
      // Active testing: User is IN_PROGRESS and App is in an active-testing
      // state. S7-5: HANDSHAKE campaigns live in TESTING_ACTIVE while legacy
      // FREE/PAID use IN_TESTING — include both so the hub Running tab shows
      // every active campaign.
      // S12: WAITING_FOR_PARTNERS (24h pre-start window) also belongs here — it
      // was previously invisible in the list while getAppsCount already
      // counted it, so the Running badge said N with an empty list.
      whereCond.status = {
        in: ["IN_TESTING", "TESTING_ACTIVE", "WAITING_FOR_PARTNERS"],
      };
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

    // Spec: the Available tab shows oldest campaigns on top.
    const orderByClause =
      type === "AVAILABLE" ? { createdAt: "asc" as const } : undefined;

    // Spec: "If anyone have sent me handshake request their campaign will
    // show on top". Collect the offered campaigns of my incoming PENDING
    // requests so the mapper can boost them above the rest (still
    // oldest-first within each group).
    let boostedCampaignIds = new Set<number>();
    if (type === "AVAILABLE") {
      const incoming = await prismaClient.handshakeRequest.findMany({
        where: { toUserId: req?.userId, status: "PENDING" },
        select: { offeredAppId: true },
      });
      for (const r of incoming) {
        if (r.offeredAppId) boostedCampaignIds.add(r.offeredAppId);
      }
    }

    const hubApps = await prismaClient?.dashboardAndHub?.findMany({
      where: whereCond,
      orderBy: orderByClause,
      include: {
        androidApp: {
          include: {
            appCategory: true,
          },
        },
        // S5a-1: expose owner identity + level/badge so the frontend
        // DeveloperCard can render real data (was previously undefined).
        appOwner: {
          select: {
            id: true,
            name: true,
            image: true,
            handshakeLevel: true,
            eliteBadge: true,
          },
        },
        testerRelations: {
          where: {
            testerId: req?.userId,
          },
          include: {
            // S12: today's-proof indicator for the Running card.
            // verifiedAt added so the mapper can filter to current-cycle
            // verifications only (adminRestartApp preserves old-cycle rows
            // as audit trail).
            dailyVerifications: {
              select: { dayNumber: true, status: true, verifiedAt: true },
            },
            // S12: the exact 1:1 partner side of this handshake. relationA/
            // relationB are @unique on HandshakeLink so traversing the link
            // (instead of offeredApp) is precise even when a campaign hosts
            // multiple testers. Legacy relations without a link yield null
            // and the frontend simply hides the partner block.
            handshakeLinkAsA: {
              select: {
                id: true,
                status: true,
                relationB: {
                  select: {
                    id: true,
                    status: true,
                    daysCompleted: true,
                    dailyVerifications: {
                      select: { verifiedAt: true },
                    },
                    tester: {
                      select: {
                        id: true,
                        name: true,
                        image: true,
                        handshakeLevel: true,
                        eliteBadge: true,
                      },
                    },
                    dashboardAndHub: {
                      select: {
                        id: true,
                        status: true,
                        currentDay: true,
                        totalDay: true,
                        testingStartDate: true,
                        testingStartEligibleAt: true,
                        androidApp: {
                          select: { appName: true, appLogoUrl: true },
                        },
                      },
                    },
                  },
                },
              },
            },
            handshakeLinkAsB: {
              select: {
                id: true,
                status: true,
                relationA: {
                  select: {
                    id: true,
                    status: true,
                    daysCompleted: true,
                    dailyVerifications: {
                      select: { verifiedAt: true },
                    },
                    tester: {
                      select: {
                        id: true,
                        name: true,
                        image: true,
                        handshakeLevel: true,
                        eliteBadge: true,
                      },
                    },
                    dashboardAndHub: {
                      select: {
                        id: true,
                        status: true,
                        currentDay: true,
                        totalDay: true,
                        testingStartDate: true,
                        testingStartEligibleAt: true,
                        androidApp: {
                          select: { appName: true, appLogoUrl: true },
                        },
                      },
                    },
                  },
                },
              },
            },
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
            // S12: surface the 24h pre-start window instead of masking it as
            // active testing so the Running card can show a start countdown.
            else if (item.status === "WAITING_FOR_PARTNERS")
              status = "WAITING_FOR_PARTNERS";
            else status = "IN_TESTING"; // Fallback
          } else if (rStatus === "REJECTED") status = "REJECTED";
         else if (rStatus === "COMPLETED") status = "COMPLETED";

         // Use relation specific statusDetails if rejected
         if (rStatus === "REJECTED" && relation.statusDetails) {
           statusDetails = relation.statusDetails;
         }
        }

        // Waiting states (testing cannot have started yet, so any daysCompleted
        // on the relation is stale audit-trail data from adminRestartApp). The
        // mapper below zeroes it out so the Running card doesn't render a
        // previous cycle's progress as current.
        const isWaiting =
          status === "ACCEPTED" || status === "WAITING_FOR_PARTNERS";

        // Convert Date objects to ISO strings for JSON serialization
        return {
          ...item,
          createdAt: item.createdAt?.toISOString() || null,
          updatedAt: item.updatedAt?.toISOString() || null,
          status,
          statusDetails: statusDetails
            ? JSON.parse(JSON.stringify(statusDetails))
            : null,
          testerRelations:
            item.testerRelations?.map((relation) => {
              // S12: collapse the two mutually-exclusive link includes into a
              // single clean `handshakePair` for the frontend.
              //
              // Prefer an ACTIVE link. The relation row is unique per
              // (tester, campaign) and gets reused across cycles; an old
              // COMPLETED HandshakeLink from a previous cycle can still be
              // attached (adminRestartApp preserves it as audit trail).
              // Surface the pair only for the ACTIVE link so stale partner
              // data doesn't leak into the Running card.
              const linkA = relation.handshakeLinkAsA;
              const linkB = relation.handshakeLinkAsB;
              const link =
                [linkA, linkB].find((l) => l?.status === "ACTIVE") ?? null;
              const partnerRelation = link
                ? linkA?.status === "ACTIVE"
                  ? linkA.relationB
                  : linkB?.relationA
                : null;
              const { handshakeLinkAsA, handshakeLinkAsB, ...restRelation } =
                relation;

              // Current-cycle days for the viewer. AdminRestartApp preserves
              // `daysCompleted` and `dailyVerifications` as audit trail, so
              // the raw row reflects a previous cycle. For an active campaign
              // the current cycle starts at `testingStartDate` (re-stamped by
              // adminRestartApp), so we count proofs with verifiedAt >=
              // testingStartDate. Pre-start states and missing start date
              // are handled in `currentCycleDays`.
              const ownDays = currentCycleDays(
                relation.daysCompleted,
                relation.dailyVerifications,
                item.status,
                item.testingStartDate,
              );
              const ownCycleVerifications =
                isWaiting || !item.testingStartDate
                  ? []
                  : (relation.dailyVerifications || []).filter(
                      (v) =>
                        v.verifiedAt &&
                        new Date(v.verifiedAt).getTime() >=
                          new Date(item.testingStartDate!).getTime(),
                    );

              // Current-cycle days for the partner side, same logic. The
              // partner relation row carries the same stale-from-reopen
              // values, so apply the same computation using the partner
              // campaign's status and testingStartDate.
              const partnerCampaign = partnerRelation?.dashboardAndHub ?? null;
              const partnerDays =
                partnerRelation && partnerCampaign
                  ? currentCycleDays(
                      partnerRelation.daysCompleted,
                      partnerRelation.dailyVerifications,
                      partnerCampaign.status,
                      partnerCampaign.testingStartDate,
                    )
                  : 0;

              return {
                ...restRelation,
                createdAt: relation.createdAt?.toISOString() || null,
                updatedAt: relation.updatedAt?.toISOString() || null,
                lastActivityAt: relation.lastActivityAt?.toISOString() || null,
                statusDetails: relation.statusDetails
                  ? JSON.parse(JSON.stringify(relation.statusDetails))
                  : null,
                // Always display the current-cycle value. While waiting,
                // currentCycleDays returns 0; while active, it counts
                // verifiedAt >= testingStartDate. Pre-restart rows that
                // happened before the new cycle start are excluded.
                daysCompleted: ownDays,
                dailyVerifications: ownCycleVerifications,
                hadMissSinceStart: isWaiting
                  ? false
                  : relation.hadMissSinceStart,
                handshakePair: link
                  ? {
                      linkId: link.id,
                      linkStatus: link.status,
                      partnerRelation: partnerRelation
                        ? {
                            id: partnerRelation.id,
                            status: partnerRelation.status,
                            daysCompleted: partnerDays,
                            tester: partnerRelation.tester,
                            campaign: partnerRelation.dashboardAndHub
                              ? {
                                  id: partnerRelation.dashboardAndHub.id,
                                  status:
                                    partnerRelation.dashboardAndHub.status,
                                  currentDay:
                                    partnerRelation.dashboardAndHub.currentDay,
                                  totalDay:
                                    partnerRelation.dashboardAndHub.totalDay,
                                  testingStartDate:
                                    partnerRelation.dashboardAndHub.testingStartDate,
                                  testingStartEligibleAt:
                                    partnerRelation.dashboardAndHub.testingStartEligibleAt,
                                  androidApp:
                                    partnerRelation.dashboardAndHub.androidApp,
                                }
                              : null,
                          }
                        : null,
                    }
                  : null,
              };
            }) || [],
        };
     });

    // Spec ordering for the Available tab: campaigns whose owner sent me a
    // PENDING handshake request first, then everything else — oldest first
    // within each group (base query is already createdAt asc).
    if (type === "AVAILABLE" && boostedCampaignIds.size > 0 && result) {
      result.sort((a: any, b: any) => {
        const ab = boostedCampaignIds.has(a.id) ? 0 : 1;
        const bb = boostedCampaignIds.has(b.id) ? 0 : 1;
        if (ab !== bb) return ab - bb;
        return (
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      });
    }

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
    // Count available apps. Filters mirror getHubApps(type:"AVAILABLE")
    // so the badge on /app/handshake-testing stays in sync with the list:
    //   - P2.6 parity: exclude only ACTIVE relations so re-handshake-eligible
    //     developers (terminal relations like COMPLETED/REJECTED/DROPPED/
    //     REPLACED/CANCELLED) stay visible.
    //   - S8-G3b parity: hide campaigns the user has already sent a pending
    //     handshake request to (spec §3.2 "next time I send to a new dev").
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
            status: { in: ["PENDING", "IN_PROGRESS", "MISSED", "PENALIZED"] },
          },
        },
        handshakeRequestsAsTarget: {
          none: {
            fromUserId: req.userId,
            status: "PENDING",
          },
        },
        // Do NOT hide campaigns offered to me in an incoming pending
        // request —  the spec says those campaigns show on top of the list
        // (they sent me a request first). They stay visible in the
        // AVAILABLE bucket and get boosted in the post-query sort.
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
        // P1.4: project only public fields —  full User scalars (email etc.)
        // must not leak to every viewer of the campaign detail.
        appOwner: {
          select: {
            id: true,
            name: true,
            image: true,
            handshakeLevel: true,
            eliteBadge: true,
          },
        },
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
            // Partner-readiness for the owner waiting view: traverse the
            // ACTIVE link to the partner's own campaign status.
            handshakeLinkAsA: {
              select: {
                id: true,
                status: true,
                relationB: {
                  select: {
                    dashboardAndHub: {
                      select: { id: true, status: true },
                    },
                  },
                },
              },
            },
            handshakeLinkAsB: {
              select: {
                id: true,
                status: true,
                relationA: {
                  select: {
                    dashboardAndHub: {
                      select: { id: true, status: true },
                    },
                  },
                },
              },
            },
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
                handshakeLevel: true,
                eliteBadge: true,
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
          ? hubAppDetails?.testerRelations?.map((item: any) => {
              const parsed = JSON.parse(
                JSON.stringify(item?.statusDetails),
              ) as Record<string, unknown> | null;
              if (parsed?.image) {
                parsed.image = normalizeR2Url(parsed.image as string);
              }
              if (parsed?.video) {
                parsed.video = normalizeR2Url(parsed.video as string);
              }
              // Partner readiness for the owner waiting view (spec: "Ready"
              // = the partner's own campaign has filled; "Finding testers"
              // = still assembling). Same ACTIVE-link + readiness rule as
              // the cron transition (Job C) and the getHubApps mapper. Null
              // when there is no ACTIVE link (legacy fills) so the UI falls
              // back to raw relation status.
              const ownLink =
                [item?.handshakeLinkAsA, item?.handshakeLinkAsB].find(
                  (l: any) => l?.status === "ACTIVE",
                ) ?? null;
              const partnerCampaignStatus =
                ownLink &&
                (item?.handshakeLinkAsA?.status === "ACTIVE"
                  ? item?.handshakeLinkAsA?.relationB?.dashboardAndHub?.status
                  : item?.handshakeLinkAsB?.relationA?.dashboardAndHub
                      ?.status);
              const partnerReadiness: "READY" | "FINDING" | null = !ownLink
                ? null
                : partnerCampaignStatus &&
                    [
                      "WAITING_FOR_PARTNERS",
                      "TESTING_ACTIVE",
                      "COMPLETED",
                    ].includes(partnerCampaignStatus)
                  ? "READY"
                  : "FINDING";
              const { handshakeLinkAsA, handshakeLinkAsB, ...restItem } = item;
              return {
                ...restItem,
                statusDetails: parsed,
                partnerReadiness,
                dailyVerifications: item?.dailyVerifications?.map(
                  (item2: any) => ({
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
      const appId = Number(id);
      const ownerId = hubAppDetails.appOwnerId;
      // S11-B1/B2: surface pending v2 handshake requests so the detail page
      // can offer Accept/Reject (owner's pending request to viewer) instead of
      // the generic join CTA, and show "Request sent" (viewer's own pending).
      if (req?.userId && ownerId && ownerId !== req.userId) {
        const [pendingIncomingRequest, myPendingOutgoingRequest] =
          await Promise.all([
            prismaClient.handshakeRequest.findFirst({
              where: {
                fromUserId: ownerId,
                toUserId: req.userId,
                offeredAppId: appId,
                status: "PENDING",
              },
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                message: true,
                expiresAt: true,
                createdAt: true,
                fromUser: {
                  select: { id: true, name: true, image: true },
                },
              },
            }),
            prismaClient.handshakeRequest.findFirst({
              where: {
                fromUserId: req.userId,
                toUserId: ownerId,
                requestedAppId: appId,
                status: "PENDING",
              },
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                expiresAt: true,
                createdAt: true,
                offeredApp: {
                  select: {
                    id: true,
                    androidApp: {
                      select: { appName: true, appLogoUrl: true },
                    },
                  },
                },
              },
            }),
          ]);
        result.handshake = {
          ...(result.handshake || {}),
          pendingIncomingRequest: pendingIncomingRequest
            ? {
                id: pendingIncomingRequest.id,
                message: pendingIncomingRequest.message,
                expiresAt: pendingIncomingRequest.expiresAt,
                createdAt: pendingIncomingRequest.createdAt,
                fromUser: pendingIncomingRequest.fromUser,
              }
            : null,
          // R5g: myPendingOutgoingRequest is irrelevant when an ACTIVE link
          // already exists between viewer and owner — accepting would 409.
          // The frontend hides the pending card when linkStatus === "ACTIVE"
          // but we also null it here for clarity.
          myPendingOutgoingRequest: myPendingOutgoingRequest
            ? {
                id: myPendingOutgoingRequest.id,
                expiresAt: myPendingOutgoingRequest.expiresAt,
                createdAt: myPendingOutgoingRequest.createdAt,
                offeredApp: myPendingOutgoingRequest.offeredApp,
              }
            : null,
        };
      }

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
                  // P1.4: public-fields-only projection (see above).
                  include: {
                    androidApp: true,
                    appOwner: {
                      select: {
                        id: true,
                        name: true,
                        image: true,
                        handshakeLevel: true,
                        eliteBadge: true,
                      },
                    },
                  },
                },
              },
            },
            relationB: {
              include: {
                dashboardAndHub: {
                  include: {
                    androidApp: true,
                    appOwner: {
                      select: {
                        id: true,
                        name: true,
                        image: true,
                        handshakeLevel: true,
                        eliteBadge: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });
        if (link) {
          const { processStagedPenalty, getPenaltyBlockState } = await import(
            "@/lib/handshake"
          );
          await processStagedPenalty(link.id);
          const isA = link.relationAId === myRelation.id;
          const partnerRelation = isA ? link.relationB : link.relationA;
          const { blocked: penaltyBlocked, openCount: penaltyOpenCount } =
            await getPenaltyBlockState(req.userId!);
          result.handshake = {
            ...(result.handshake || {}),
            linkId: link.id,
            linkStatus: "ACTIVE",
            isBlocked: penaltyBlocked,
            penaltyCount: penaltyOpenCount,
            partnerApp: partnerRelation.dashboardAndHub?.androidApp,
            partnerOwner: partnerRelation.dashboardAndHub?.appOwner,
            // R5g: when an ACTIVE link already exists the viewer is
            // mid-handshake; any pending incoming request from the owner
            // would conflict (Accept → 409 __ALREADY_PARTICIPATING__).
            // Suppress the pendingIncomingRequest in this branch so the
            // frontend doesn't render an Accept/Reject card alongside
            // ActiveHandshakeCard.
            pendingIncomingRequest: null,
          };
        } else {
          // Spec: animated celebration when the handshake COMPLETES from
          // both sides. Surface the most recent COMPLETED link so the
          // detail page can celebrate once (tracked client-side).
          const completedLink = await prismaClient.handshakeLink.findFirst({
            where: {
              status: "COMPLETED",
              OR: [
                { relationAId: myRelation.id },
                { relationBId: myRelation.id },
              ],
            },
            orderBy: { updatedAt: "desc" },
            select: { id: true, updatedAt: true },
          });
          if (completedLink) {
            result.handshake = {
              ...(result.handshake || {}),
              completedLinkId: completedLink.id,
              completedAt: completedLink.updatedAt?.toISOString() || null,
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
      },
      include: {
        androidApp: true,
      },
    });

    if (!checkTester) {
      return sendError(res, 404, "Application not found or not accepting requests");
    }

    // S7-3: friendly pre-check for an existing relation (the old
    // `testerRelations.none` filter permanently locked out re-requests after
    // rejection/completion with a misleading "owner is not accepting" error).
    const existingRelation = await prismaClient?.testerRelation?.findUnique({
      where: {
        testerId_dashboardAndHubId: {
          testerId: req?.userId || "",
          dashboardAndHubId: Number(hub_id),
        },
      },
      select: { id: true, status: true, isActive: true },
    });
    if (
      existingRelation &&
      ["PENDING", "IN_PROGRESS", "MISSED", "PENALIZED"].includes(
        existingRelation.status,
      )
    ) {
      return sendError(
        res,
        409,
        `You already have a ${existingRelation.status === "PENDING" ? "pending request" : "active participation"} for this app`,
      );
    }

    if (
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

    // P1.5: server-side penalty gate (spec §30) —  penalized users may not
    // join new handshake campaigns until they serve their tasks.
    if (isHandshake) {
      const { getPenaltyBlockState } = await import("@/lib/handshake");
      const { blocked, openCount } = await getPenaltyBlockState(req.userId!);
      if (blocked) {
        return sendError(
          res,
          423,
          "You have an active penalty that must be served before joining new handshake tests",
          undefined,
          undefined,
          {
            blocked: true,
            reason: "Active penalty —  see /handshake-testing/penalty",
            penaltyCount: openCount,
          },
        );
      }
    }

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
      const level = user?.handshakeLevel ?? 0;
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
      // P2.12: re-check the requester's slot cap INSIDE the tx —  the
      // pre-tx check alone raced concurrent mutual matches and could push a
      // user past their level cap.
      if (isHandshake) {
        const { getAvailableSlots, getActiveHandshakeCount } = await import(
          "@/lib/handshake"
        );
        const user = await tx.user.findUnique({
          where: { id: req.userId! },
          select: { handshakeLevel: true },
        });
      const level = user?.handshakeLevel ?? 0;
        const slots = getAvailableSlots(level);
        const activeCount = await getActiveHandshakeCount(req.userId!);
        if (activeCount >= slots) {
          throw new Error("__JOINER_SLOTS_EXHAUSTED__");
        }
      }

      // S7-3: create-or-reuse (terminal rows are reactivated to PENDING so
      // re-requests after rejection/completion work per spec §11).
      const { upsertTesterRelation } = await import("@/lib/handshake");
      await upsertTesterRelation(tx, {
        testerId: req?.userId || "",
        hubId: Number(hub_id),
        reactivateStatus: "PENDING",
        offeredAppId: isHandshake ? Number(offered_app_id) : null,
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
    // S7-3: map the shared helper's sentinel to a friendly 409.
    if (error instanceof Error && error.message === "__ALREADY_PARTICIPATING__") {
      return sendError(
        res,
        409,
        "You already have a pending request or active participation for this app",
      );
    }
    if (error instanceof Error && error.message === "__JOINER_SLOTS_EXHAUSTED__") {
      return sendError(
        res,
        409,
        "You have reached your handshake limit. Level up to unlock more.",
        undefined,
        undefined,
        { slotsExhausted: true },
      );
    }
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

    // Ownership guard: only the campaign owner may accept join requests.
    if (checkTester.appOwnerId !== req.userId) {
      return sendError(res, 403, "Only the app owner can accept this request");
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
      const ownerLevel = ownerUser?.handshakeLevel ?? 0;
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
      // P2.12: re-validate the requester's slot cap INSIDE the transaction ,
      // between request time and accept time they may have consumed slots via
      // mutual matches elsewhere; acceptance must not push them over the cap.
      if (isHandshake) {
        const { getAvailableSlots, getActiveHandshakeCount } = await import(
          "@/lib/handshake"
        );
        const reqUser = await tx.user.findUnique({
          where: { id: tester_id },
          select: { handshakeLevel: true },
        });
        const reqLevel = reqUser?.handshakeLevel ?? 0;
        const reqSlots = getAvailableSlots(reqLevel);
        const reqActive = await getActiveHandshakeCount(tester_id);
        if (reqActive >= reqSlots) {
          throw new Error("__REQUESTER_SLOTS_EXHAUSTED__");
        }
      }

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
        // S7-3: create-or-reuse so a terminal row from an earlier cycle
        // doesn't die on the unique constraint with a raw P2002.
        const { upsertTesterRelation } = await import("@/lib/handshake");
        const reciprocal = await upsertTesterRelation(tx, {
          testerId: checkTester.appOwnerId,
          hubId: offeredApp.id,
          reactivateStatus: "IN_PROGRESS",
        });
        reciprocalRelationId = reciprocal?.id ?? null;

        // Increment tester count on the offered app too.
        // H-B7 (S4c-4) + S6-6/S6-7: atomic conditional increment restricted
        // to actively-recruiting statuses, then an appType-gated transition
        // derived from the POST-increment row. HANDSHAKE enters the 24h
        // WAITING_FOR_PARTNERS window; FREE/PAID keep legacy immediate
        // IN_TESTING activation.
        const offeredInc = await tx?.dashboardAndHub?.updateMany({
          where: {
            id: offeredApp.id,
            status: { in: ["AVAILABLE", "FINDING_TESTERS"] },
            currentTester: { lt: offeredApp.totalTester },
          },
          data: { currentTester: { increment: 1 } },
        });
        if (offeredInc?.count === 0) {
          throw new Error("__SLOT_FULL__");
        }
        const offeredFresh = await tx?.dashboardAndHub?.findUnique({
          where: { id: offeredApp.id },
          select: {
            currentTester: true,
            totalTester: true,
            status: true,
            appType: true,
          },
        });
        const offeredRecruiting =
          !!offeredFresh &&
          offeredFresh.totalTester > 0 &&
          offeredFresh.currentTester >= offeredFresh.totalTester &&
          (offeredFresh.status === "AVAILABLE" ||
            offeredFresh.status === "FINDING_TESTERS");
        if (offeredRecruiting) {
          const now = new Date();
          if (offeredFresh!.appType === "HANDSHAKE") {
            // Spec §11, §13: 24-hour waiting period before testing starts.
            await tx?.dashboardAndHub?.updateMany({
              where: {
                id: offeredApp.id,
                status: { in: ["AVAILABLE", "FINDING_TESTERS"] },
                currentTester: { gte: offeredFresh!.totalTester },
              },
              data: {
                status: "WAITING_FOR_PARTNERS",
                waitingPeriodStartedAt: now,
                testingStartEligibleAt: new Date(
                  now.getTime() + 24 * 60 * 60 * 1000,
                ),
              },
            });
            // S8-G4: campaign is full — cancel other pending requests that
            // were still targeting it so requesters pick a fresh partner.
            await cancelPendingRequestsForCampaign(tx, offeredApp.id, now);
          } else {
            // Legacy behavior for FREE/PAID: testing starts immediately.
            const totalDay = offeredApp.totalDay || 14;
            await tx?.dashboardAndHub?.updateMany({
              where: {
                id: offeredApp.id,
                status: { in: ["AVAILABLE", "FINDING_TESTERS"] },
                currentTester: { gte: offeredFresh!.totalTester },
              },
              data: {
                status: "IN_TESTING",
                testingStartDate: now,
                testingEndDate: new Date(
                  now.getTime() + totalDay * 24 * 60 * 60 * 1000,
                ),
              },
            });
          }
        }
      }

      // H-B7 (S4c-4) + S6-6/S6-7: atomic conditional increment restricted to
      // actively-recruiting statuses prevents over-enrollment; the transition
      // is applied from the POST-increment state so concurrent joint fills
      // stamp exactly once. HANDSHAKE → 24h WAITING window; FREE/PAID →
      // legacy immediate IN_TESTING.
      const incResult = await tx?.dashboardAndHub?.updateMany({
        where: {
          id: Number(hub_id),
          status: { in: ["AVAILABLE", "FINDING_TESTERS"] },
          currentTester: { lt: checkTester.totalTester },
        },
        data: { currentTester: { increment: 1 } },
      });

      if (incResult?.count === 0) {
        // Race-loser: someone else just filled the slot. Abort the transaction
        // by throwing; the outer catch returns 409 to the caller.
        throw new Error("__SLOT_FULL__");
      }

      const freshTarget = await tx?.dashboardAndHub?.findUnique({
        where: { id: Number(hub_id) },
        select: {
          currentTester: true,
          totalTester: true,
          status: true,
          appType: true,
          totalDay: true,
        },
      });
      const targetRecruiting =
        !!freshTarget &&
        freshTarget.totalTester > 0 &&
        freshTarget.currentTester >= freshTarget.totalTester &&
        (freshTarget.status === "AVAILABLE" ||
          freshTarget.status === "FINDING_TESTERS");
      if (targetRecruiting) {
        const now = new Date();
        if (freshTarget!.appType === "HANDSHAKE") {
          // Spec §11, §13: 24-hour waiting period before testing starts.
          await tx?.dashboardAndHub?.updateMany({
            where: {
              id: Number(hub_id),
              status: { in: ["AVAILABLE", "FINDING_TESTERS"] },
              currentTester: { gte: freshTarget!.totalTester },
            },
            data: {
              status: "WAITING_FOR_PARTNERS",
              waitingPeriodStartedAt: now,
              testingStartEligibleAt: new Date(
                now.getTime() + 24 * 60 * 60 * 1000,
              ),
            },
          });
          // S8-G4: campaign is full — cancel other pending requests that
          // were still targeting it so requesters pick a fresh partner.
          await cancelPendingRequestsForCampaign(tx, Number(hub_id), now);
        } else {
          // Legacy behavior for FREE/PAID: testing starts immediately.
          const totalDay = freshTarget!.totalDay || 14;
          await tx?.dashboardAndHub?.updateMany({
            where: {
              id: Number(hub_id),
              status: { in: ["AVAILABLE", "FINDING_TESTERS"] },
              currentTester: { gte: freshTarget!.totalTester },
            },
            data: {
              status: "IN_TESTING",
              testingStartDate: now,
              testingEndDate: new Date(
                now.getTime() + totalDay * 24 * 60 * 60 * 1000,
              ),
            },
          });
        }
      }

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
      // H-B7: race-loser when all slots were filled between check and update.
      if (error instanceof Error && error.message === "__SLOT_FULL__") {
        return sendError(
          res,
          409,
          "This campaign just filled up. Please try a different one.",
        );
      }
      // P2.12: requester cap re-check fired inside the tx (rolled back).
      if (
        error instanceof Error &&
        error.message === "__REQUESTER_SLOTS_EXHAUSTED__"
      ) {
        return sendError(
          res,
          409,
          "The requester has reached their handshake limit since sending this request. They must free a slot first.",
          undefined,
          undefined,
          { slotsExhausted: true },
        );
      }
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

    // Ownership guard: only the campaign owner may reject join requests.
    if (checkTester.appOwnerId !== req.userId) {
      return sendError(res, 403, "Only the app owner can reject this request");
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
          // S6-8: deactivate the row so stale REJECTED relations never block
          // cron readiness checks (transitionReadyCampaigns requires every
          // isActive relation to be IN_PROGRESS/COMPLETED).
          isActive: false,
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
        // P2.11: accept both active-testing states —  HANDSHAKE campaigns
        // live in TESTING_ACTIVE (never IN_TESTING), so the old exact-match
        // gate made feedback impossible for the entire handshake flow.
        status: { in: ["IN_TESTING", "TESTING_ACTIVE"] },
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
        // S12: cycle-aware nextDay derivation (see step 2 below) needs to
        // count current-cycle proofs; carry verifiedAt + status so the
        // gateway rejects stale (pre-restart) rows automatically.
        dailyVerifications: {
          select: { dayNumber: true, status: true, verifiedAt: true },
        },
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

    // S7-1: appType-aware gate. HANDSHAKE campaigns live in TESTING_ACTIVE
    // (24h WAITING window → cron transition); FREE/PAID keep the legacy
    // lifecycle where IN_TESTING IS the active-testing state.
    const campaignStatus = relation.dashboardAndHub?.status;
    const campaignType = relation.dashboardAndHub?.appType;
    const statusOk =
      campaignStatus === "TESTING_ACTIVE" ||
      (campaignType !== "HANDSHAKE" && campaignStatus === "IN_TESTING");
    if (relation.status !== "IN_PROGRESS" || !statusOk) {
      return sendError(
        res,
        400,
        "Testing for this app is not currently in progress.",
      );
    }

    // Spec §27, §29: handshake penalty is task-based, not block-based.
    // Process staged penalty (creates MissedDay rows + PenaltyTasks) before allowing submission.
    if (relation.dashboardAndHub?.appType === "HANDSHAKE") {
      const { processStagedPenalty } = await import("@/lib/handshake");
      const link = await prismaClient.handshakeLink.findFirst({
        where: {
          status: "ACTIVE",
          OR: [{ relationAId: relation.id }, { relationBId: relation.id }],
        },
      });
      if (link) {
        await processStagedPenalty(link.id);
      }
      // Block submission if user has an active penalty that prevents normal testing.
      const { getPenaltyBlockState } = await import("@/lib/handshake");
      const { blocked: penaltyBlocked, openCount: penaltyOpenCount } =
        await getPenaltyBlockState(userId!);
      if (penaltyBlocked) {
        return sendError(
          res,
          423,
          "You have an active penalty that must be served before normal testing.",
          undefined,
          undefined,
          {
            blocked: true,
            reason: "Active penalty —  see /handshake-testing/penalty",
            penaltyCount: penaltyOpenCount,
          },
        );
      }
    }

    // 2. Determine Day Number — cycle-aware.
    //
    // The raw `daysCompleted` column can be stale across cycles (admin restart,
    // re-handshake after completion, suspended→re-approved). Always trust
    // current-cycle proofs (`verifiedAt >= testingStartDate`) when the
    // campaign has a testing start date; fall back to the stored counter
    // only when no start date exists yet (legacy). Same rule as the display
    // helper `currentCycleDays` so submission agrees with what's rendered.
    const totalDaysRequired = relation.dashboardAndHub?.totalDay || 16;
    const testingStartDate = relation.dashboardAndHub?.testingStartDate;
    const ownDailyVerifications = (relation as any).dailyVerifications as
      | { verifiedAt: Date | string | null; status: string }[]
      | undefined;
    const cycleProofCount =
      testingStartDate && ownDailyVerifications
        ? ownDailyVerifications.filter(
            (v) =>
              v?.verifiedAt &&
              new Date(v.verifiedAt).getTime() >=
                new Date(testingStartDate).getTime() &&
              v.status !== "REJECTED",
          ).length
        : null;
    const nextDay =
      cycleProofCount !== null
        ? cycleProofCount + 1
        : relation.daysCompleted + 1;
    const completedNow = nextDay >= totalDaysRequired;

    if (nextDay > totalDaysRequired) {
      return sendError(
        res,
        400,
        "You have already completed the required testing days.",
      );
    }

    // P2.4: per-day time gate —  day N only opens after testingStartDate +
    // (N-1) calendar days. Without this the whole 16 day cycle (and with it
    // the hadMiss/level rules) could be completed in minutes.
    if (
      relation.dashboardAndHub?.appType === "HANDSHAKE" &&
      relation.dashboardAndHub?.testingStartDate
    ) {
      const startMs = new Date(
        relation.dashboardAndHub.testingStartDate,
      ).getTime();
      const earliestMs =
        startMs + (nextDay - 1) * 24 * 60 * 60 * 1000 - 60 * 60 * 1000; // 1h grace skew
      if (Date.now() < earliestMs) {
        const opensAt = new Date(earliestMs);
        return sendError(
          res,
          425,
          `Day ${nextDay} verification opens on ${opensAt.toISOString().slice(0, 16).replace("T", " ")} UTC. Come back then.`,
        );
      }
    }

    // 3. Duplicate Check — cycle-aware.
    //
    // The unique constraint is (testerRelationId, dayNumber). For handshake
    // campaigns with a start date we scope to the current cycle
    // (verifiedAt >= testingStartDate); REJECTED rows in-cycle are NOT
    // duplicates — they are REJECTED proofs awaiting resubmission (the
    // user's nextDay regressed to the rejected day). For non-handshake (no
    // start date) the raw dayNumber check is fine.
    const cycleStartMs = testingStartDate
      ? new Date(testingStartDate).getTime()
      : null;
    const ownVerifications = (relation as any).dailyVerifications as
      | { id: number; dayNumber: number; status: string; verifiedAt: Date | string | null }[]
      | undefined;
    const existingVerifiedCycleProof = cycleStartMs
      ? ownVerifications?.find(
          (v) =>
            v?.dayNumber === nextDay &&
            v?.verifiedAt &&
            new Date(v.verifiedAt).getTime() >= cycleStartMs &&
            v.status === "VERIFIED",
        )
      : null;
    const existingRejectedCycleProof = cycleStartMs
      ? ownVerifications?.find(
          (v) =>
            v?.dayNumber === nextDay &&
            v?.verifiedAt &&
            new Date(v.verifiedAt).getTime() >= cycleStartMs &&
            v.status === "REJECTED",
        )
      : null;
    const existingLegacyRaw = cycleStartMs
      ? null
      : await prismaClient.dailyTesterVerification.findFirst({
          where: {
            testerRelationId: relation.id,
            dayNumber: nextDay,
          },
        });

    // A REJECTED row in the current cycle is NOT a duplicate — the user
    // is resubmitting after an admin rejected the previous proof. Fall
    // through to update it.
    if (existingVerifiedCycleProof || existingLegacyRaw) {
      return sendError(
        res,
        409,
        `Verification for day ${nextDay} already submitted.`,
      );
    }

    // 4. Create OR replace a previously-rejected proof.
    //
    // R1 (audit E-D1): an admin REJECTED a daily proof but
    // daysCompleted was not decremented, so cycleProofCount regressed to
    // the rejected day. The unique constraint blocks a re-create on the
    // same dayNumber. Resolution: when we find an in-cycle REJECTED row
    // for the target dayNumber, UPDATE it in place (new image, new
    // verifiedAt, VERIFIED) instead of failing with P2002.
    await prismaClient.$transaction(async (tx) => {
      if (existingRejectedCycleProof) {
        // R1 race guard: claim the REJECTED row atomically. The pre-tx
        // existence check happened outside the transaction, so two
        // concurrent resubmits of the same rejected day could both pass
        // it. Without this guard, both would `update` the same row
        // (UPDATE never throws P2002) and BOTH would proceed to
        // `daysCompleted: { increment: 1 }`, double-counting one day.
        // updateMany with a status predicate makes the claim exclusive:
        // the loser sees count === 0 and we surface a friendly 409
        // (handled in the catch block) instead of silently double-charging.
        // Also clears the stale rejectionReason so the now-VERIFIED row
        // doesn't carry a contradictory admin note forward.
        const claimed = await tx.dailyTesterVerification.updateMany({
          where: { id: existingRejectedCycleProof.id, status: "REJECTED" },
          data: {
            proofImageUrl: normalizeR2Url(proofImage),
            status: "VERIFIED",
            rejectionReason: null,
            verifiedAt: new Date(),
            metaData: JSON.stringify({
              ...metaData,
              ipAddress: req?.userIpAddress,
              resubmittedAt: new Date().toISOString(),
            }),
          },
        });
        if (claimed.count === 0) {
          throw new Error("__DUPLICATE_DAY__");
        }
      } else {
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
      }

      let newStatus = relation.status;
      let completedAt = relation.completedAt;

      if (nextDay >= totalDaysRequired) {
        newStatus = "COMPLETED";
        completedAt = new Date();

        // 5. Notify App Owner
        await tx.notification.create({
          data: {
            title: "Tester Completed!",
            description: `A tester has completed the full 16-day testing period for your app.`,
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
              ? "Completed full 16-day testing period"
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
    // R1 race guard: a concurrent resubmit just claimed the rejected row.
    if (error instanceof Error && error.message === "__DUPLICATE_DAY__") {
      return sendError(
        res,
        409,
        "Verification for this day was just submitted. Refresh to see the latest state.",
      );
    }
    // P2002 = unique constraint on (testerRelationId, dayNumber). Two
    // concurrent first-time submissions raced past the pre-tx duplicate
    // check. Roll back the entire tx (no double-increment) and surface a
    // friendly 409 instead of a 400 with the raw Prisma message — same
    // pattern as penalty.controller.ts:458.
    if (error && (error as any)?.code === "P2002") {
      return sendError(
        res,
        409,
        "Verification for this day was already submitted.",
      );
    }
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

    // Anti-farming gate (P1.2): a HANDSHAKE campaign may only be completed by
    // its owner once testing has actually started AND every active tester has
    // served all required days. Otherwise two colluding users could complete
    // on day 0 and farm level credit.
    if (isHandshake) {
      if (app.status !== "TESTING_ACTIVE") {
        return sendError(
          res,
          409,
          "Testing has not started for this campaign yet",
        );
      }
      const requiredDays = app.totalDay || 16;
      const activeTesters = await prismaClient.testerRelation.findMany({
        where: {
          dashboardAndHubId: app.id,
          isActive: true,
          status: "IN_PROGRESS",
        },
        select: { id: true, daysCompleted: true },
      });
      const unfinished = activeTesters.filter(
        (rel) => (rel.daysCompleted || 0) < requiredDays,
      );
      if (unfinished.length > 0) {
        return sendError(
          res,
          409,
          `${unfinished.length} tester(s) have not completed all ${requiredDays} days yet`,
        );
      }
    }

    await prismaClient.$transaction(async (tx) => {
      // Update App Status to COMPLETED
      await tx.dashboardAndHub.update({
        where: { id: app.id },
        data: {
          status: "COMPLETED",
        },
      });

      // S9: the legacy points-reward loop has been removed — the platform
      // has no points economy. Handshake testing is pure barter; Pro apps
      // pay money rewards via the admin completion flow.

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
    // S7-1: keep statuses consistent per vertical —  HANDSHAKE active state is
    // TESTING_ACTIVE (its verification gate requires it); FREE/PAID stay on
    // legacy IN_TESTING.
    const activatedStatus = app.appType === "HANDSHAKE" ? "TESTING_ACTIVE" : "IN_TESTING";
    const updatedApp = await prismaClient.dashboardAndHub.update({
      where: { id: app.id },
      data: {
        status: activatedStatus,
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
