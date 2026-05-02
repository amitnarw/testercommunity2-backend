import { parsePrismaError } from "@/utils/prismaErrorHandler";
import path from "path";
import fs from "fs";
import logger from "../utils/logger";
import { prismaClient } from "@/lib/prisma";
import { auth, type SessionWithRole } from "@/lib/auth";
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

    // Build filter - exclude DRAFT status unless includeDrafts is true
    const includeDrafts = req.query.includeDrafts === "true";
    const where: any = includeDrafts ? {} : { status: { not: "DRAFT" } };

    if (status) {
      if (status === "ACCEPTED" || status === "AVAILABLE") {
        where.status = "AVAILABLE"; // Map accepted to available
      } else {
        where.status = status;
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
        promoCode: {
          select: {
            id: true,
            code: true,
            discountType: true,
            discountValue: true,
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
    const { id, totalTester, totalDay, minimumAndroidVersion, rewardPoints } =
      payload;
    if (!id) {
      return sendError(res, 400, "App ID is required");
    }

    const existingApp = await prismaClient.dashboardAndHub.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingApp) {
      return sendError(res, 404, "App not found");
    }

    // Validation for testing parameters
    if (totalTester === undefined || parseInt(totalTester) <= 0) {
      return sendError(res, 400, "Total Testers must be a positive number");
    }
    if (totalDay === undefined || parseInt(totalDay) <= 0) {
      return sendError(res, 400, "Total Duration must be a positive number");
    }
    if (minimumAndroidVersion === undefined) {
      return sendError(res, 400, "Minimum Android Version is required");
    }
    if (rewardPoints === undefined || parseFloat(rewardPoints) < 0) {
      return sendError(
        res,
        400,
        "Reward Points/Payout must be a non-negative number",
      );
    }

    const dataToUpdate: any = {};

    // Only set AVAILABLE status if it was IN_REVIEW
    if (existingApp.status === "IN_REVIEW") {
      dataToUpdate.status = "AVAILABLE";
    }

    if (totalTester !== undefined)
      dataToUpdate.totalTester = parseInt(totalTester);
    if (totalDay !== undefined) dataToUpdate.totalDay = parseInt(totalDay);
    if (minimumAndroidVersion !== undefined)
      dataToUpdate.minimumAndroidVersion = parseFloat(minimumAndroidVersion);
    if (rewardPoints !== undefined) {
      if (existingApp.appType === "PAID") {
        // Persist rewardMoney as the actual money payout per tester
        dataToUpdate.rewardMoney = parseFloat(rewardPoints);
        dataToUpdate.rewardPoints = 0; // reset points for paid apps
      } else {
        dataToUpdate.rewardPoints = parseFloat(rewardPoints);
        dataToUpdate.rewardMoney = 0;
      }
    }

    const updatedApp = await prismaClient.dashboardAndHub.update({
      where: { id: parseInt(id) },
      data: dataToUpdate,
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

export const updateProjectStatus = async (req: Request, res: Response) => {
  try {
    const { payload } = req.body;
    const { id, status } = payload;
    if (!id) {
      return sendError(res, 400, "App ID is required");
    }
    if (!status) {
      return sendError(res, 400, "Status is required");
    }

    const updatedApp = await prismaClient.dashboardAndHub.update({
      where: { id: parseInt(id) },
      data: {
        status: status,
      },
    });

    return sendSuccess(
      res,
      updatedApp as any,
      `App status updated to ${status} successfully`,
    );
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
    const appType = req.query.appType as string;

    // Build where clause - exclude DRAFT status unless includeDrafts is true
    const includeDrafts = req.query.includeDrafts === "true";
    const where: any = includeDrafts ? {} : { status: { not: "DRAFT" } };

    // Add appType filter if provided and not ALL
    if (appType && appType !== "ALL") {
      where.appType = appType;
    }

    const counts = await prismaClient.dashboardAndHub.groupBy({
      by: ["status"],
      where,
      _count: {
        _all: true,
      },
    });

    // Transform to formatted object
    const formattedCounts: Record<string, number> = {};
    counts.forEach((item) => {
      formattedCounts[item.status] = item._count._all;
    });

    // Calculate total (excluding DRAFT)
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

// ==================== DASHBOARD STATS ====================

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    // Get total users count
    const totalUsers = await prismaClient.user.count();

    // Get total submissions count
    const totalSubmissions = await prismaClient.dashboardAndHub.count();

    // Get testers count (users with tester relations)
    const testers = await prismaClient.testerRelation.groupBy({
      by: ["testerId"],
    });
    const totalTesters = testers.length;

    // Get feedback count
    const totalFeedback = await prismaClient.feedback.count();

    // Get submissions by status
    const submissionsByStatus = await prismaClient.dashboardAndHub.groupBy({
      by: ["status"],
      _count: {
        _all: true,
      },
    });

    // Get submissions by app type
    const submissionsByAppType = await prismaClient.dashboardAndHub.groupBy({
      by: ["appType"],
      _count: {
        _all: true,
      },
    });

    // Get recent submissions (last 5)
    const recentSubmissions = await prismaClient.dashboardAndHub.findMany({
      take: 5,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        androidApp: {
          select: {
            appName: true,
            appLogoUrl: true,
          },
        },
        appOwner: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    // Get pending approvals count
    const pendingApprovals = await prismaClient.dashboardAndHub.count({
      where: {
        status: "IN_REVIEW",
      },
    });

    // Get monthly growth data (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlySubmissions = await prismaClient.dashboardAndHub.groupBy({
      by: ["appType"],
      where: {
        createdAt: {
          gte: sixMonthsAgo,
        },
      },
      _count: {
        _all: true,
      },
    });

    const monthlyUsers = await prismaClient.user.groupBy({
      by: ["createdAt"],
      where: {
        createdAt: {
          gte: sixMonthsAgo,
        },
      },
    });

    // Get users by role
    const usersByRole = await prismaClient.userDetail.groupBy({
      by: ["roleId"],
      _count: {
        _all: true,
      },
    });

    // Get total verifications count
    const totalVerifications =
      await prismaClient.dailyTesterVerification.count();

    // Get pending verifications
    const pendingVerifications =
      await prismaClient.dailyTesterVerification.count({
        where: { status: "PENDING" },
      });

    // Get today's verifications
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayVerifications = await prismaClient.dailyTesterVerification.count(
      {
        where: {
          createdAt: {
            gte: today,
          },
        },
      },
    );

    // Get support requests stats
    const totalSupportRequests = await prismaClient.supportRequest.count();
    const pendingSupportRequests = await prismaClient.supportRequest.count({
      where: { status: "PENDING" },
    });

    // Get active testers today (distinct testers who did a verification today)
    const activeTestersTodayData =
      await prismaClient.dailyTesterVerification.groupBy({
        by: ["testerRelationId"],
        where: {
          createdAt: {
            gte: today,
          },
        },
      });
    const activeTestersToday = activeTestersTodayData.length;

    const stats = {
      totalUsers,
      totalSubmissions,
      totalTesters,
      totalFeedback,
      pendingApprovals,
      totalVerifications,
      pendingVerifications,
      todayVerifications,
      totalSupportRequests,
      pendingSupportRequests,
      activeTestersToday,
      submissionsByStatus: submissionsByStatus.reduce(
        (acc, item) => {
          acc[item.status] = item._count._all;
          return acc;
        },
        {} as Record<string, number>,
      ),
      submissionsByAppType: submissionsByAppType.reduce(
        (acc, item) => {
          acc[item.appType] = item._count._all;
          return acc;
        },
        {} as Record<string, number>,
      ),
      recentSubmissions: recentSubmissions.map((sub) => ({
        id: sub.id,
        appName: sub.androidApp?.appName,
        appType: sub.appType,
        status: sub.status,
        ownerName: sub.appOwner?.name,
        createdAt: sub.createdAt.toISOString(),
      })),
      monthlyGrowth: {
        submissions: monthlySubmissions,
        users: monthlyUsers.length,
      },
    };

    return sendSuccess(res, stats, "Dashboard stats fetched successfully");
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

// ==================== FEEDBACK MANAGEMENT ====================

export const getAllFeedback = async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string;
    const appType = req.query.appType as string;

    const where: any = {};

    if (status && status !== "All") {
      where.type = status;
    }

    if (appType && appType !== "ALL") {
      where.dashboardAndHub = {
        appType: appType,
      };
    }

    const feedback = await prismaClient.feedback.findMany({
      where,
      include: {
        tester: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        dashboardAndHub: {
          select: {
            id: true,
            appType: true,
            androidApp: {
              select: {
                appName: true,
              },
            },
          },
        },
        media: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return sendSuccess(res, feedback as any, "Feedback fetched successfully");
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const getFeedbackById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const feedback = await prismaClient.feedback.findUnique({
      where: { id: parseInt(id as string) },
      include: {
        tester: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        dashboardAndHub: {
          select: {
            id: true,
            appType: true,
            androidApp: {
              select: {
                appName: true,
              },
            },
          },
        },
        media: true,
      },
    });

    if (!feedback) {
      return sendError(res, 404, "Feedback not found");
    }

    return sendSuccess(res, feedback as any, "Feedback fetched successfully");
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const updateFeedbackStatus = async (req: Request, res: Response) => {
  try {
    const { payload } = req.body;
    const { id, priority } = payload;

    if (!id) {
      return sendError(res, 400, "Feedback ID is required");
    }

    const updatedFeedback = await prismaClient.feedback.update({
      where: { id: parseInt(id) },
      data: {
        priority: priority || null,
      },
    });

    return sendSuccess(
      res,
      updatedFeedback as any,
      "Feedback updated successfully",
    );
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const deleteFeedback = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await prismaClient.feedback.delete({
      where: { id: parseInt(id as string) },
    });

    return sendSuccess(res, null, "Feedback deleted successfully");
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const getFeedbackCounts = async (req: Request, res: Response) => {
  try {
    const counts = await prismaClient.feedback.groupBy({
      by: ["type"],
      _count: {
        _all: true,
      },
    });

    const formattedCounts: Record<string, number> = {};
    counts.forEach((item) => {
      formattedCounts[item.type] = item._count._all;
    });

    const total = Object.values(formattedCounts).reduce(
      (acc, curr) => acc + curr,
      0,
    );
    formattedCounts["All"] = total;

    return sendSuccess(
      res,
      formattedCounts,
      "Feedback counts fetched successfully",
    );
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

// ==================== USER MANAGEMENT ====================

export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const role = req.query.role as string;
    const status = req.query.status as string;
    const search = req.query.search as string;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    if (status && status !== "All") {
      if (status === "Active") {
        where.userDetail = { banned: false };
      } else if (status === "Banned") {
        where.userDetail = { banned: true };
      }
    }

    let users;
    if (role && role !== "All") {
      // Get role ID
      const roleRecord = await prismaClient.role.findFirst({
        where: { name: role },
      });

      if (roleRecord) {
        where.userDetail = { ...where.userDetail, roleId: roleRecord.id };
      }
    }

    users = await prismaClient.user.findMany({
      where,
      include: {
        userDetail: {
          include: {
            role: true,
          },
        },
        testerRelations: {
          select: {
            status: true,
            lastActivityAt: true,
          },
        },
        _count: {
          select: {
            testerRelations: true,
            ownedDashboardAndHubApps: true,
            feedbacks: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const formattedUsers = users.map((user) => {
      // Calculate active and completed test counts from testerRelations
      const activeTests = user.testerRelations.filter(
        (tr) => tr.status === "IN_PROGRESS" || tr.status === "PENDING",
      ).length;
      const completedTests = user.testerRelations.filter(
        (tr) => tr.status === "COMPLETED",
      ).length;

      // Get the most recent activity timestamp
      const lastActivityAt =
        user.testerRelations
          .map((tr) => tr.lastActivityAt)
          .filter(Boolean)
          .sort((a, b) => (b?.getTime() || 0) - (a?.getTime() || 0))[0] || null;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.userDetail?.role?.name || "User",
        status: user.userDetail?.banned ? "Banned" : "Active",
        availability: user.userDetail?.availability || "AVAILABLE",
        testingPaths: user.userDetail?.profile_type || [],
        device:
          user.userDetail?.device_company && user.userDetail?.device_model
            ? `${user.userDetail.device_company} ${user.userDetail.device_model}`
            : null,
        experience: user.userDetail?.experience_level || null,
        tests: user._count.testerRelations,
        activeTests,
        completedTests,
        lastActivityAt: lastActivityAt?.toISOString() || null,
        submissions: user._count.ownedDashboardAndHubApps,
        feedbacks: user._count.feedbacks,
        createdAt: user.createdAt.toISOString(),
      };
    });

    return sendSuccess(res, formattedUsers, "Users fetched successfully");
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const getUserById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await prismaClient.user.findUnique({
      where: { id: id as string },
      include: {
        userDetail: {
          include: {
            role: true,
          },
        },
        testerRelations: {
          include: {
            dashboardAndHub: {
              include: {
                androidApp: {
                  select: {
                    appName: true,
                  },
                },
              },
            },
          },
        },
        ownedDashboardAndHubApps: {
          include: {
            androidApp: {
              select: {
                appName: true,
              },
            },
          },
        },
        feedbacks: {
          take: 10,
          orderBy: {
            createdAt: "desc",
          },
        },
        wallet: true,
      },
    });

    if (!user) {
      return sendError(res, 404, "User not found");
    }

    const formattedUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      emailVerified: user.emailVerified,
      role: user.userDetail?.role?.name || "User",
      status: user.userDetail?.banned ? "Banned" : "Active",
      banReason: user.userDetail?.ban_reason || "",
      phone: user.userDetail?.phone || null,
      availability: user.userDetail?.availability || "AVAILABLE",
      device:
        user.userDetail?.device_company && user.userDetail?.device_model
          ? `${user.userDetail.device_company} ${user.userDetail.device_model}`
          : null,
      deviceDetails: {
        company: user.userDetail?.device_company || null,
        model: user.userDetail?.device_model || null,
        ram: user.userDetail?.ram || null,
        os: user.userDetail?.os || null,
        screenResolution: user.userDetail?.screen_resolution || null,
      },
      experience: user.userDetail?.experience_level || null,
      profileType: user.userDetail?.profile_type || null,
      country: user.userDetail?.country || null,
      wallet: user.wallet,
      stats: {
        totalTests: user.testerRelations.length,
        activeTests: user.testerRelations.filter(
          (tr) => tr.status === "IN_PROGRESS" || tr.status === "PENDING",
        ).length,
        completedTests: user.testerRelations.filter(
          (tr) => tr.status === "COMPLETED",
        ).length,
        droppedTests: user.testerRelations.filter(
          (tr) => tr.status === "DROPPED" || tr.status === "REMOVED",
        ).length,
        totalSubmissions: user.ownedDashboardAndHubApps.length,
        totalFeedbacks: user.feedbacks.length,
      },
      recentTests: user.testerRelations.slice(0, 10).map((tr) => ({
        id: tr.id,
        appName: tr.dashboardAndHub?.androidApp?.appName || "",
        status: tr.status,
        daysCompleted: tr.daysCompleted,
        joinedAt: tr.joinedAt.toISOString() || "",
        completedAt: tr.completedAt?.toISOString() || null,
        lastActivityAt: tr.lastActivityAt?.toISOString() || null,
      })),
      recentSubmissions: user.ownedDashboardAndHubApps
        .slice(0, 5)
        .map((sub) => ({
          id: sub.id,
          appName: sub.androidApp?.appName,
          status: sub.status,
          appType: sub.appType,
          createdAt: sub.createdAt.toISOString() || "",
        })),
      createdAt: user.createdAt.toISOString() || "",
    };

    return sendSuccess(res, formattedUser, "User fetched successfully");
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const updateUserStatus = async (req: Request, res: Response) => {
  try {
    const { payload } = req.body;
    const { id, status, banReason } = payload;

    if (!id) {
      return sendError(res, 400, "User ID is required");
    }

    // Prevention: User cannot ban themselves
    if (id === req.userId) {
      return sendError(res, 400, "You cannot ban your own account");
    }

    const updatedUser = await prismaClient.userDetail.update({
      where: { userId: id },
      data: {
        banned: status === "Banned",
        ban_reason: status === "Banned" ? banReason : null,
      },
    });

    return sendSuccess(
      res,
      updatedUser as any,
      "User status updated successfully",
    );
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const updateUserRole = async (req: Request, res: Response) => {
  try {
    const callerRole = req.role;

    const { payload } = req.body;
    const { id, role } = payload;

    if (!id || !role) {
      return sendError(res, 400, "User ID and role are required");
    }

    // Block assigning super_admin role to anyone (new super_admins only via seed)
    if (role === "super_admin" && callerRole !== "super_admin") {
      return sendError(res, 403, "Only Super Admins can assign Super Admin role");
    }

    // Get target user to check their current role
    const targetUser = await prismaClient.userDetail.findUnique({
      where: { userId: id },
      include: { role: true },
    });

    if (!targetUser) {
      return sendError(res, 404, "User not found");
    }

    const targetRole = targetUser.role?.name;

    // Non-super_admin callers cannot modify super_admin accounts
    if (targetRole === "super_admin" && callerRole !== "super_admin") {
      return sendError(res, 403, "Only Super Admins can modify Super Admin accounts");
    }

    const roleRecord = await prismaClient.role.findFirst({
      where: { name: role },
    });

    if (!roleRecord) {
      return sendError(res, 404, "Role not found");
    }

    const updatedUser = await prismaClient.userDetail.update({
      where: { userId: id },
      data: {
        roleId: roleRecord.id,
      },
    });

    return sendSuccess(
      res,
      updatedUser as any,
      "User role updated successfully",
    );
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return sendError(res, 400, "User ID is required");
    }

    // Check if user exists
    const user = await prismaClient.user.findUnique({
      where: { id: id as string },
      include: {
        userDetail: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user) {
      return sendError(res, 404, "User not found");
    }

    const actorRole = req.role;
    const targetRole = user.userDetail?.role?.name;

    // Prevention: No user can be deleted if they are a Super Admin
    if (targetRole === "super_admin") {
      return sendError(
        res,
        403,
        "Super Admin accounts cannot be deleted for safety and security reasons",
      );
    }

    // Prevention: Admin cannot delete themselves (redundant now but good for clarity)
    if (user.id === req.userId) {
      return sendError(res, 400, "You cannot delete your own account");
    }

    // Permission check: Admins can only delete regular Users/Testers.
    // Super Admins can delete anyone (except Super Admins).
    if (actorRole !== "super_admin" && targetRole === "admin") {
      return sendError(res, 403, "Only Super Admins can delete Admin accounts");
    }

    // Handle relations that don't cascade automatically or need special care
    await prismaClient.$transaction(async (tx) => {
      // 1. Delete tester relations and their verifications (manually just in case)
      await tx.testerRelation.deleteMany({ where: { testerId: id as string } });

      // 2. Delete apps owned by user (must delete dependencies first)
      const ownedApps = await tx.dashboardAndHub.findMany({
        where: { appOwnerId: id as string },
      });

      for (const app of ownedApps) {
        // Feedbacks for this app
        await tx.feedback.deleteMany({ where: { dashboardAndHubId: app.id } });
        // Tester relations for this app
        await tx.testerRelation.deleteMany({
          where: { dashboardAndHubId: app.id },
        });
        // Transactions for this app
        await tx.userTransaction.deleteMany({
          where: { dashboardAndHubId: app.id },
        });
        // Finally delete the dashboard entry
        await tx.dashboardAndHub.delete({ where: { id: app.id } });
        // NOTE: The AndroidApp model might still exist, we can keep it for historical data or delete it too.
        // Let's delete it if it's not referenced elsewhere (though here it's 1-1 with DashboardAndHub mostly).
        await tx.androidApp.delete({ where: { id: app.appId } });
      }

      // 3. Delete feedback given by user
      await tx.feedback.deleteMany({ where: { testerId: id as string } });

      // 4. Delete withdrawal requests
      await tx.withdrawalRequest.deleteMany({ where: { userId: id as string } });

      // 5. Delete website feedback suggestions
      await tx.websiteFeedbackSuggestion.deleteMany({ where: { userId: id as string } });

      // 6. Delete audit logs where user is actor
      await tx.auditLog.deleteMany({ where: { actorId: id as string } });

      // 7. Delete ratings
      await tx.rating.deleteMany({ where: { userId: id as string } });

      // Finally delete the user - most other data (userDetail, session, etc.) will cascade delete
      await tx.user.delete({ where: { id: id as string } });
    });

    return sendSuccess(
      res,
      null,
      "User and all associated data deleted successfully",
    );
  } catch (error) {
    console.error("Error deleting user:", error);
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const getUserCounts = async (req: Request, res: Response) => {
  try {
    const totalUsers = await prismaClient.user.count();

    const usersByRole = await prismaClient.userDetail.groupBy({
      by: ["roleId"],
      _count: {
        _all: true,
      },
    });

    const roles = await prismaClient.role.findMany();
    const roleMap = roles.reduce(
      (acc, role) => {
        acc[role.id] = role.name;
        return acc;
      },
      {} as Record<number, string>,
    );

    const formattedCounts: Record<string, number> = {
      All: totalUsers,
    };

    usersByRole.forEach((item) => {
      const roleName = roleMap[item.roleId] || "Unknown";
      formattedCounts[roleName] = item._count._all;
    });

    // Get banned count
    const bannedCount = await prismaClient.userDetail.count({
      where: { banned: true },
    });
    formattedCounts["Banned"] = bannedCount;

    return sendSuccess(
      res,
      formattedCounts,
      "User counts fetched successfully",
    );
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

// ==================== SUGGESTIONS MANAGEMENT ====================

export const getAllSuggestions = async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string;

    const where: any = {};
    if (status && status !== "All") {
      where.status = status;
    }

    const suggestions = await prismaClient.websiteFeedbackSuggestion.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        media: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return sendSuccess(
      res,
      suggestions as any,
      "Suggestions fetched successfully",
    );
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const getSuggestionById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const suggestion = await prismaClient.websiteFeedbackSuggestion.findUnique({
      where: { id: parseInt(id as string) },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        media: true,
      },
    });

    if (!suggestion) {
      return sendError(res, 404, "Suggestion not found");
    }

    return sendSuccess(
      res,
      suggestion as any,
      "Suggestion fetched successfully",
    );
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const createSuggestion = async (req: Request, res: Response) => {
  try {
    const { payload } = req.body;
    const { title, message, type, priority, userId } = payload;

    if (!message) {
      return sendError(res, 400, "Message is required");
    }

    const suggestion = await prismaClient.websiteFeedbackSuggestion.create({
      data: {
        userId: userId || req.userId || "",
        type: type || "SUGGESTIONS",
        title: title || null,
        message,
        priority: priority || null,
        status: "PENDING",
      },
    });

    return sendSuccess(
      res,
      suggestion as any,
      "Suggestion created successfully",
    );
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const updateSuggestionStatus = async (req: Request, res: Response) => {
  try {
    const { payload } = req.body;
    const { id, status, reason } = payload;

    if (!id || !status) {
      return sendError(res, 400, "Suggestion ID and status are required");
    }

    const updatedSuggestion =
      await prismaClient.websiteFeedbackSuggestion.update({
        where: { id: parseInt(id) },
        data: {
          status,
          reason: reason || null,
        },
      });

    return sendSuccess(
      res,
      updatedSuggestion as any,
      "Suggestion updated successfully",
    );
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const deleteSuggestion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await prismaClient.websiteFeedbackSuggestion.delete({
      where: { id: parseInt(id as string) },
    });

    return sendSuccess(res, null, "Suggestion deleted successfully");
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const getSuggestionCounts = async (req: Request, res: Response) => {
  try {
    const counts = await prismaClient.websiteFeedbackSuggestion.groupBy({
      by: ["status"],
      _count: {
        _all: true,
      },
    });

    const formattedCounts: Record<string, number> = {};
    counts.forEach((item) => {
      formattedCounts[item.status] = item._count._all;
    });

    const total = Object.values(formattedCounts).reduce(
      (acc, curr) => acc + curr,
      0,
    );
    formattedCounts["All"] = total;

    return sendSuccess(
      res,
      formattedCounts,
      "Suggestion counts fetched successfully",
    );
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

// ==================== NOTIFICATIONS MANAGEMENT ====================

export const getAllNotifications = async (req: Request, res: Response) => {
  try {
    const type = req.query.type as string;

    const where: any = {};
    if (type && type !== "All") {
      where.type = type;
    }

    const notifications = await prismaClient.notification.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        media: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return sendSuccess(
      res,
      notifications as any,
      "Notifications fetched successfully",
    );
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const createNotification = async (req: Request, res: Response) => {
  try {
    const { payload } = req.body;
    const { title, description, type, url, userId, isActive } = payload;

    if (!title || !description) {
      return sendError(res, 400, "Title and description are required");
    }

    const validTypes = [
      "FEEDBACK_RECEIVED",
      "TEST_COMPLETED",
      "BUG_REPORT",
      "POINTS_AWARDED",
      "POINTS_DEDUCTED",
      "NEW_JOIN_REQUEST",
      "NEW_JOIN_ACCEPT",
      "REJECTED",
      "APP_APPROVED",
      "APP_REJECTED",
      "TEST_INVITATION",
      "GENERAL_MESSAGE",
      "REMINDER",
      "ANNOUNCEMENT",
      "ACCOUNT_UPDATE",
      "INSUFFICIENT_BALANCE",
      "OTHER",
    ];

    if (type && !validTypes.includes(type)) {
      return sendError(res, 400, `Invalid notification type. Must be one of: ${validTypes.join(", ")}`);
    }

    const notification = await prismaClient.notification.create({
      data: {
        title,
        description,
        type: type || "OTHER",
        url: url || null,
        userId: userId || null,
        isActive: isActive ?? true,
      },
    });

    return sendSuccess(
      res,
      notification as any,
      "Notification created successfully",
    );
  } catch (error) {
    const { userMessage, technicalMessage } = parsePrismaError(error);
    return sendError(res, 500, userMessage, undefined, technicalMessage);
  }
};

export const updateNotification = async (req: Request, res: Response) => {
  try {
    const { payload } = req.body;
    const { id, title, description, type, url, isActive } = payload;

    if (!id) {
      return sendError(res, 400, "Notification ID is required");
    }

    const updatedNotification = await prismaClient.notification.update({
      where: { id: parseInt(id) },
      data: {
        title,
        description,
        type,
        url,
        isActive,
      },
    });

    return sendSuccess(
      res,
      updatedNotification as any,
      "Notification updated successfully",
    );
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const deleteNotification = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await prismaClient.notification.delete({
      where: { id: parseInt(id as string) },
    });

    return sendSuccess(res, null, "Notification deleted successfully");
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const broadcastNotification = async (req: Request, res: Response) => {
  try {
    const { payload } = req.body;
    const { title, description, type, url } = payload;

    if (!title || !description) {
      return sendError(res, 400, "Title and description are required");
    }

    // Create a single global notification
    const notification = await prismaClient.notification.create({
      data: {
        title,
        description,
        type: type || "OTHER",
        url: url || null,
        userId: null,
        isActive: true,
      },
    });

    return sendSuccess(
      res,
      { count: 1, id: notification.id },
      "Notification broadcasted successfully",
    );
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const getNotificationCounts = async (req: Request, res: Response) => {
  try {
    const counts = await prismaClient.notification.groupBy({
      by: ["type"],
      _count: {
        _all: true,
      },
    });

    const formattedCounts: Record<string, number> = {};
    counts.forEach((item) => {
      formattedCounts[item.type] = item._count._all;
    });

    const total = Object.values(formattedCounts).reduce(
      (acc, curr) => acc + curr,
      0,
    );
    formattedCounts["All"] = total;

    return sendSuccess(
      res,
      formattedCounts,
      "Notification counts fetched successfully",
    );
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

// ==================== NOTIFICATION TYPES ====================

export const getNotificationTypes = async (req: Request, res: Response) => {
  try {
    const types = [
      "FEEDBACK_RECEIVED",
      "TEST_COMPLETED",
      "BUG_REPORT",
      "POINTS_AWARDED",
      "POINTS_DEDUCTED",
      "NEW_JOIN_REQUEST",
      "NEW_JOIN_ACCEPT",
      "REJECTED",
      "APP_APPROVED",
      "APP_REJECTED",
      "TEST_INVITATION",
      "GENERAL_MESSAGE",
      "REMINDER",
      "ANNOUNCEMENT",
      "ACCOUNT_UPDATE",
      "INSUFFICIENT_BALANCE",
      "OTHER",
    ];
    return sendSuccess(res, types, "Notification types fetched successfully");
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

// ==================== TESTER APPLICATIONS ====================

export const getTesterApplications = async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string;
    const search = req.query.search as string;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const applications = await prismaClient.user.findMany({
      where,
      include: {
        userDetail: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Transform data to match frontend expectations
    const transformedApplications = applications.map((app: any) => ({
      id: app.id,
      name: app.name,
      email: app.email,
      date: app.createdAt.toISOString(),
      experience: app.userDetail?.experience_level || "Not specified",
      expertise: [], // This would need to be implemented based on your data model
      status: "pending", // Default status
    }));

    // Filter by status if provided
    const filteredApplications = status
      ? transformedApplications.filter((app) => app.status === status)
      : transformedApplications;

    return sendSuccess(
      res,
      filteredApplications,
      "Tester applications fetched successfully",
    );
  } catch (error) {
    console.error("Error in getTesterApplications:", error);
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const getTesterApplicationCounts = async (
  req: Request,
  res: Response,
) => {
  try {
    const total = await prismaClient.user.count();
    const active = await prismaClient.user.count({
      where: {
        userDetail: {
          banned: false,
        },
      },
    });
    const newUsers = await prismaClient.user.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
    });
    const pending = await prismaClient.user.count({
      where: {
        // Assuming pending applications have some specific status
        // This is a placeholder - adjust based on your actual data model
      },
    });
    const approved = await prismaClient.user.count({
      where: {
        // Assuming approved users have some specific status
        // This is a placeholder - adjust based on your actual data model
      },
    });
    const rejected = await prismaClient.user.count({
      where: {
        userDetail: {
          banned: true,
        },
      },
    });

    const counts = {
      total,
      active,
      new: newUsers,
      pending,
      approved,
      rejected,
    };

    return sendSuccess(
      res,
      counts,
      "Tester application counts fetched successfully",
    );
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const getTesterApplicationById = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;

    const application = await prismaClient.user.findUnique({
      where: {
        id: id as string,
      },
      include: {
        userDetail: true,
      },
    });

    if (!application) {
      return sendError(res, 404, "Tester application not found");
    }

    // Transform data to match frontend expectations
    const transformedApplication = {
      id: application.id,
      name: application.name,
      email: application.email,
      date: application.createdAt.toISOString(),
      experience: application.userDetail?.experience_level || "Not specified",
      expertise: [], // This would need to be implemented based on your data model
      status: "pending", // Default status
      bio: "Not specified",
      devices: [], // This would need to be implemented based on your data model
      osVersions: [], // This would need to be implemented based on your data model
    };

    return sendSuccess(
      res,
      transformedApplication,
      "Tester application fetched successfully",
    );
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const updateTesterApplicationStatus = async (
  req: Request,
  res: Response,
) => {
  try {
    const { id, status, reason } = req.body.payload;

    // Update user status based on status
    if (status === "approved") {
      await prismaClient.userDetail.update({
        where: {
          userId: id,
        },
        data: {
          banned: false,
        },
      });
    } else if (status === "rejected") {
      await prismaClient.userDetail.update({
        where: {
          userId: id,
        },
        data: {
          banned: true,
          ban_reason: reason,
        },
      });
    }

    return sendSuccess(
      res,
      { id, status },
      "Tester application status updated successfully",
    );
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const assignTestersToApp = async (req: Request, res: Response) => {
  try {
    const { payload } = req.body;
    const { id, testerIds } = payload; // id is DashboardAndHub ID

    if (!id || !Array.isArray(testerIds) || testerIds.length === 0) {
      return sendError(
        res,
        400,
        "App ID and an array of tester IDs are required",
      );
    }

    const app = await prismaClient.dashboardAndHub.findUnique({
      where: { id: parseInt(id) },
    });

    if (!app) {
      return sendError(res, 404, "App not found");
    }

    // Check existing tester relations to prevent duplicates
    const existingRelations = await prismaClient.testerRelation.findMany({
      where: {
        dashboardAndHubId: parseInt(id),
        testerId: { in: testerIds },
      },
    });

    const existingTesterIds = existingRelations.map((rel) => rel.testerId);
    const newTesterIds = testerIds.filter(
      (tId) => !existingTesterIds.includes(tId),
    );

    if (newTesterIds.length === 0) {
      return sendError(
        res,
        400,
        "All provided testers are already assigned to this app",
      );
    }

    // Create new relations
    const newRelationsData = newTesterIds.map((tId) => ({
      testerId: tId,
      dashboardAndHubId: parseInt(id),
      status: "IN_PROGRESS" as const, // Initial status for testers
      isActive: true,
    }));

    await prismaClient.testerRelation.createMany({
      data: newRelationsData,
    });

    // Update currentTester count on DashboardAndHub
    const newCurrentTester = app.currentTester + newTesterIds.length;
    let newStatus = app.status;

    // Move to IN_TESTING only if the required number of testers is reached
    if (
      app.status === "AVAILABLE" &&
      newCurrentTester >= (app.totalTester || 0)
    ) {
      newStatus = "IN_TESTING";
    }

    const updateData: any = {
      currentTester: newCurrentTester,
      status: newStatus,
    };

    // Set testing dates when moving to IN_TESTING
    if (newStatus === "IN_TESTING" && !app.testingStartDate) {
      const now = new Date();
      updateData.testingStartDate = now;
      updateData.testingEndDate = new Date(
        now.getTime() + (app.totalDay || 14) * 24 * 60 * 60 * 1000
      );
    }

    const updatedApp = await prismaClient.dashboardAndHub.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        androidApp: true,
      },
    });

    // Create notifications for the newly assigned testers
    const notificationsData = newTesterIds.map((tId) => ({
      title: "New Paid Testing Assignment",
      description: `You have been assigned to test "${updatedApp.androidApp?.appName}". You can now begin testing.`,
      type: "OTHER" as const,
      userId: tId,
      isActive: true,
    }));

    await prismaClient.notification.createMany({
      data: notificationsData,
    });

    return sendSuccess(res, updatedApp as any, "Testers assigned successfully");
  } catch (error) {
    console.error("Error assigning testers:", error);
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const unassignTesterFromApp = async (req: Request, res: Response) => {
  try {
    const { payload } = req.body;
    const { id, testerId } = payload; // id is DashboardAndHub ID

    if (!id || !testerId) {
      return sendError(res, 400, "App ID and Tester ID are required");
    }

    const app = await prismaClient.dashboardAndHub.findUnique({
      where: { id: parseInt(id) },
    });

    if (!app) {
      return sendError(res, 404, "App not found");
    }

    // Check if relation exists
    const relation = await prismaClient.testerRelation.findFirst({
      where: {
        dashboardAndHubId: parseInt(id),
        testerId: testerId,
      },
    });

    if (!relation) {
      return sendError(res, 404, "Tester is not assigned to this app");
    }

    // Delete relation
    await prismaClient.testerRelation.delete({
      where: { id: relation.id },
    });

    // Update currentTester count on DashboardAndHub
    const newCurrentTester = Math.max(0, app.currentTester - 1);
    let newStatus = app.status;

    // If testers are left but below required, move from IN_TESTING back to AVAILABLE
    if (
      app.status === "IN_TESTING" &&
      newCurrentTester < (app.totalTester || 0)
    ) {
      newStatus = "AVAILABLE";
    }

    const updatedApp = await prismaClient.dashboardAndHub.update({
      where: { id: parseInt(id) },
      data: {
        currentTester: newCurrentTester,
        status: newStatus,
      },
      include: {
        androidApp: true,
      },
    });

    return sendSuccess(
      res,
      updatedApp as any,
      "Tester unassigned successfully",
    );
  } catch (error) {
    console.error("Error unassigning tester:", error);
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

// ==================== PROMO CODE MANAGEMENT ====================

export const getAllPromoCodes = async (req: Request, res: Response) => {
  try {
    const promoCodes = await prismaClient.promoCode.findMany({
      include: {
        _count: {
          select: { dashboardAndHubs: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = promoCodes.map((pc) => ({
      ...pc,
      appCount: pc._count.dashboardAndHubs,
    }));

    return sendSuccess(res, result, "Promo codes fetched successfully");
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const createPromoCode = async (req: Request, res: Response) => {
  try {
    const { payload } = req.body;
    const { code, discountType, discountValue, isActive, maxUses, maxPerUser } =
      payload;

    if (!code) return sendError(res, 400, "Code is required");

    // Check if promo code already exists
    const existing = await prismaClient.promoCode.findUnique({
      where: { code: code.trim().toUpperCase() },
    });
    if (existing) {
      return sendError(res, 400, "A promo code with this code already exists");
    }

    const parsedDiscountValue = parseFloat(discountValue);
    const finalDiscountValue = Number.isNaN(parsedDiscountValue)
      ? 200
      : parsedDiscountValue;

    const newPromo = await prismaClient.promoCode.create({
      data: {
        code: code.trim().toUpperCase(),
        discountType: discountType || "FIXED",
        discountValue: finalDiscountValue,
        isActive: isActive !== undefined ? isActive : true,
        maxUses: maxUses ? parseInt(maxUses) : null,
        maxPerUser: maxPerUser ? parseInt(maxPerUser) : null,
      },
    });

    return sendSuccess(res, newPromo, "Promo code created successfully");
  } catch (error) {
    // Handle unique constraint error
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return sendError(res, 400, "A promo code with this code already exists");
    }
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const updatePromoCode = async (req: Request, res: Response) => {
  try {
    const { payload } = req.body;
    const { id, code, discountType, discountValue, isActive, maxUses, maxPerUser } =
      payload;

    if (!id) return sendError(res, 400, "Promo code ID is required");

    const updatedPromo = await prismaClient.promoCode.update({
      where: { id: parseInt(id) },
      data: {
        code: code ? code.trim().toUpperCase() : undefined,
        discountType:
          discountType !== undefined ? discountType : undefined,
        discountValue:
          discountValue !== undefined ? parseFloat(discountValue) : undefined,
        isActive: isActive !== undefined ? isActive : undefined,
        maxUses:
          maxUses !== undefined
            ? maxUses
              ? parseInt(maxUses)
              : null
            : undefined,
        maxPerUser:
          maxPerUser !== undefined
            ? maxPerUser
              ? parseInt(maxPerUser)
              : null
            : undefined,
      },
    });

    return sendSuccess(res, updatedPromo, "Promo code updated successfully");
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const deletePromoCode = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prismaClient.promoCode.delete({
      where: { id: parseInt(id as string) },
    });
    return sendSuccess(res, null, "Promo code deleted successfully");
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const getPromoCodeApps = async (req: Request, res: Response) => {
  try {
    const promoCodeId = parseInt(req.params.id as string);
    if (isNaN(promoCodeId)) {
      return sendError(res, 400, "Invalid promo code ID");
    }

    const apps = await prismaClient.dashboardAndHub.findMany({
      where: { promoCodeId },
      include: {
        androidApp: {
          select: {
            appName: true,
            appLogoUrl: true,
          },
        },
        appOwner: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const serializedApps = JSON.parse(JSON.stringify(apps));
    return sendSuccess(res, serializedApps, "Apps fetched successfully");
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

// ==================== VERIFICATION MANAGEMENT ====================

export const updateDailyVerificationStatus = async (
  req: Request,
  res: Response,
) => {
  try {
    const { payload } = req.body;
    const { id, status, reason } = payload;

    if (!id || !status) {
      return sendError(res, 400, "Verification ID and status are required");
    }

    const verification = await prismaClient.dailyTesterVerification.update({
      where: { id: parseInt(id) },
      data: {
        status,
        rejectionReason: reason || null,
        verifiedAt: new Date(),
      },
      include: {
        testerRelation: {
          include: {
            dashboardAndHub: {
              include: {
                androidApp: true,
              },
            },
          },
        },
      },
    });

    if (status === "REJECTED") {
      await prismaClient.notification.create({
        data: {
          title: "Testing Verification Rejected",
          description: `Your proof for Day ${verification.dayNumber} of "${verification.testerRelation.dashboardAndHub?.androidApp?.appName || "the app"}" was rejected. Reason: ${reason || "No reason provided."}`,
          type: "REJECTED",
          userId: verification.testerRelation.testerId,
          isActive: true,
        },
      });
    }

    return sendSuccess(
      res,
      verification as any,
      "Verification status updated successfully",
    );
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const adminCompleteApp = async (req: Request, res: Response) => {
  try {
    const { payload } = req.body;
    const { id } = payload; // id is DashboardAndHub ID

    if (!id) {
      return sendError(res, 400, "App ID is required");
    }

    const hubId = typeof id === "string" ? parseInt(id) : id;

    const existingApp = await prismaClient.dashboardAndHub.findUnique({
      where: { id: hubId },
      include: { androidApp: true },
    });

    if (!existingApp) {
      return sendError(res, 404, "App not found");
    }

    if (existingApp.status === "COMPLETED") {
      return sendSuccess(res, existingApp as any, "App is already completed");
    }

    const updatedApp = await prismaClient.$transaction(async (tx) => {
      const app = await tx.dashboardAndHub.update({
        where: { id: hubId },
        data: {
          status: "COMPLETED",
        },
        include: {
          androidApp: true,
        },
      });

      // Find all testers who COMPLETED the test cycle for this app
      const testersToReward = await tx.testerRelation.findMany({
        where: {
          dashboardAndHubId: hubId,
          status: "COMPLETED",
        },
      });

      const isPaidApp = app.appType === "PAID";
      const rewardAmount = isPaidApp
        ? app.rewardMoney || 0
        : app.rewardPoints || 0;

      if (rewardAmount > 0 && testersToReward.length > 0) {
        for (const rel of testersToReward) {
          const createData: any = {
            userId: rel.testerId,
            totalPackages: 0,
          };
          const updateData: any = {};

          if (isPaidApp) {
            createData.balanceMoney = rewardAmount;
            updateData.balanceMoney = { increment: rewardAmount };
          } else {
            createData.totalPoints = rewardAmount;
            updateData.totalPoints = { increment: rewardAmount };
          }

          const wallet = await tx.userWallet.upsert({
            where: { userId: rel.testerId },
            create: createData,
            update: updateData,
          });

          await tx.userTransaction.create({
            data: {
              userId: rel.testerId,
              userWalletId: wallet.id,
              dashboardAndHubId: hubId,
              action: "TESTING",
              points: rewardAmount, // Using points field generically for the transaction amount
              transactionType: "EARNING",
              status: "CREDIT",
            },
          });

          // Notify Tester
          await tx.notification.create({
            data: {
              title: isPaidApp ? "Payment Received!" : "Points Awarded!",
              description: isPaidApp
                ? `You've earned ₹${rewardAmount} for completing the testing of "${app.androidApp.appName}".`
                : `You've earned ${rewardAmount} points for completing the testing of "${app.androidApp.appName}".`,
              type: "POINTS_AWARDED",
              userId: rel.testerId,
              isActive: true,
            },
          });
        }
      }

      // Notify owner
      await tx.notification.create({
        data: {
          title: "Project Completed",
          description: `Administration has marked your project "${app.androidApp?.appName}" as COMPLETED.`,
          type: "OTHER",
          userId: app.appOwnerId,
          isActive: true,
        },
      });

      return app;
    });

    return sendSuccess(
      res,
      updatedApp as any,
      "App status updated to COMPLETED successfully",
    );
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

// ==================== BLOG MANAGEMENT ====================

export const getAllBlogs = async (req: Request, res: Response) => {
  try {
    const blogs = await prismaClient.blog.findMany({
      include: { media: true },
      orderBy: { createdAt: "desc" },
    });
    return sendSuccess(res, blogs, "Blogs fetched successfully");
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const getBlogById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const blog = await prismaClient.blog.findUnique({
      where: { id: parseInt(id as string) },
      include: { media: true },
    });
    if (!blog) return sendError(res, 404, "Blog not found");
    return sendSuccess(res, blog, "Blog fetched successfully");
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const createBlog = async (req: Request, res: Response) => {
  try {
    const { payload } = req.body;
    const {
      title,
      slug,
      excerpt,
      content,
      authorName,
      authorAvatarUrl,
      authorDataAiHint,
      imageUrl,
      dataAiHint,
      tags,
      isActive,
      date,
    } = payload;

    if (!title || !slug || !excerpt || !authorName || !authorAvatarUrl || !imageUrl) {
      return sendError(
        res,
        400,
        "Title, slug, excerpt, author name, author avatar URL, and image URL are required",
      );
    }

    // Generate slug from title if not provided
    const finalSlug = slug || title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const newBlog = await prismaClient.blog.create({
      data: {
        title,
        slug: finalSlug,
        excerpt,
        content: content || "",
        authorName,
        authorAvatarUrl,
        authorDataAiHint: authorDataAiHint || null,
        imageUrl,
        dataAiHint: dataAiHint || null,
        tags: tags || [],
        isActive: isActive !== undefined ? isActive : true,
        date: date ? new Date(date) : new Date(),
      },
    });

    return sendSuccess(res, newBlog, "Blog created successfully");
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const updateBlog = async (req: Request, res: Response) => {
  try {
    const { payload } = req.body;
    const {
      id,
      title,
      slug,
      excerpt,
      content,
      authorName,
      authorAvatarUrl,
      authorDataAiHint,
      imageUrl,
      dataAiHint,
      tags,
      isActive,
      date,
    } = payload;

    if (!id) return sendError(res, 400, "Blog ID is required");

    const updateData: any = {
      title: title !== undefined ? title : undefined,
      slug: slug !== undefined ? slug : undefined,
      excerpt: excerpt !== undefined ? excerpt : undefined,
      content: content !== undefined ? content : undefined,
      authorName: authorName !== undefined ? authorName : undefined,
      authorAvatarUrl: authorAvatarUrl !== undefined ? authorAvatarUrl : undefined,
      authorDataAiHint: authorDataAiHint !== undefined ? authorDataAiHint : undefined,
      imageUrl: imageUrl !== undefined ? imageUrl : undefined,
      dataAiHint: dataAiHint !== undefined ? dataAiHint : undefined,
      tags: tags !== undefined ? tags : undefined,
      isActive: isActive !== undefined ? isActive : undefined,
      date: date !== undefined ? new Date(date) : undefined,
    };

    // Remove undefined values
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] === undefined) delete updateData[key];
    });

    const updatedBlog = await prismaClient.blog.update({
      where: { id: parseInt(id) },
      data: updateData,
    });

    return sendSuccess(res, updatedBlog, "Blog updated successfully");
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const deleteBlog = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prismaClient.blog.delete({ where: { id: parseInt(id as string) } });
    return sendSuccess(res, null, "Blog deleted successfully");
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

// ==================== SYSTEM LOGS ====================

// Helper to safely resolve log file paths
const getLogFilePath = (filename: string) => {
  const logDir = path.resolve(process.cwd(), "logs");
  const safePath = path.resolve(logDir, filename);

  // Prevent directory traversal attacks
  if (!safePath.startsWith(logDir)) {
    throw new Error("Invalid file path");
  }
  return safePath;
};

// @desc    Get all log files
// @route   GET /api/admin/logs
// @access  Private (Admin)
export const getLogs = async (req: Request, res: Response) => {
  try {
    const logDir = path.resolve(process.cwd(), "logs");
    
    if (!fs.existsSync(logDir)) {
      return sendSuccess(res, [], "No logs directory found");
    }

    const files = fs.readdirSync(logDir);
    const logFiles = files
      .filter((file) => file.endsWith(".log") || file.endsWith(".gz"))
      .map((file) => {
        const stats = fs.statSync(path.join(logDir, file));
        return {
          filename: file,
          size: stats.size,
          mtime: stats.mtime,
        };
      })
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    return sendSuccess(res, logFiles, "Logs retrieved successfully");
  } catch (error) {
    logger.error("Error getting logs:", error);
    return sendError(res, 500, "Server Error fetching logs");
  }
};

// @desc    Get log content
// @route   GET /api/admin/logs/:filename
// @access  Private (Admin)
export const getLogContent = async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const filePath = getLogFilePath(filename as string);

    if (!fs.existsSync(filePath)) {
      return sendError(res, 404, "Log file not found");
    }

    // Only allow reading text/log files directly
    if ((filename as string).endsWith('.gz')) {
         return sendError(res, 400, "Cannot read compressed logs directly");
    }

    const stats = fs.statSync(filePath);
    if (stats.size > 10 * 1024 * 1024) { // 10MB limit
      return sendError(res, 400, "Log file too large to display directly");
    }

    const content = fs.readFileSync(filePath, "utf-8");
    return sendSuccess(res, { content, filename }, "Log content fetched");
  } catch (error) {
    logger.error("Error reading log content:", error);
    if (error instanceof Error && error.message === "Invalid file path") {
      return sendError(res, 400, "Invalid file name");
    }
    return sendError(res, 500, "Server Error fetching log content");
  }
};


// @desc    Delete a log file
// @route   DELETE /api/admin/logs/:filename
// @access  Private (Admin)
export const deleteLog = async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const filePath = getLogFilePath(filename as string);

    if (!fs.existsSync(filePath)) {
      return sendError(res, 404, "Log file not found");
    }

    fs.unlinkSync(filePath);
    return sendSuccess(res, null, "Log file deleted successfully");
  } catch (error) {
    logger.error("Error deleting log:", error);
    if (error instanceof Error && error.message === "Invalid file path") {
      return sendError(res, 400, "Invalid file name");
    }
    return sendError(res, 500, "Server Error deleting log file");
  }
};

// @desc    Delete multiple log files
// @route   POST /api/admin/logs/batch-delete
// @access  Private (Admin)
export const deleteLogsBatch = async (req: Request, res: Response) => {
  try {
    const { filenames } = req.body;
    
    if (!filenames || !Array.isArray(filenames)) {
      return sendError(res, 400, "Invalid request payload. Expected an array of filenames.");
    }

    let deletedCount = 0;
    const errors: string[] = [];

    for (const filename of filenames) {
      if (typeof filename !== "string") continue;
      
      try {
        const filePath = getLogFilePath(filename as string);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      } catch (err) {
        errors.push(`Failed to delete ${filename}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    if (deletedCount === 0 && errors.length > 0) {
      return sendError(res, 500, `Failed to delete files. Errors: ${errors.join(", ")}`);
    }

    return sendSuccess(
      res, 
      { deletedCount, errors }, 
      `Successfully deleted ${deletedCount} log files`
    );
  } catch (error) {
    logger.error("Error in batch deleting logs:", error);
    return sendError(res, 500, "Server Error deleting log files");
  }
};

// @desc    Delete a specific log entry (line) from a log file
// @route   DELETE /api/admin/logs/:filename/entry/:index
// @access  Private (Admin)
export const deleteLogEntry = async (req: Request, res: Response) => {
  try {
    const { filename, index } = req.params;
    const entryIndex = parseInt(index as string, 10);

    if (isNaN(entryIndex)) {
      return sendError(res, 400, "Invalid entry index");
    }

    const filePath = getLogFilePath(filename as string);

    if (!fs.existsSync(filePath)) {
      return sendError(res, 404, "Log file not found");
    }

    // Only allow operations on text/log files
    if ((filename as string).endsWith('.gz')) {
      return sendError(res, 400, "Cannot modify compressed logs");
    }

    // Read file and filter entries
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const lines = fileContent.split(/\r?\n/).filter((line: string) => line.trim() !== "");
    
    if (entryIndex < 0 || entryIndex >= lines.length) {
      return sendError(res, 400, "Entry index out of bounds");
    }

    lines.splice(entryIndex, 1);
    
    // Write back the file
    // Join with newline and append one at the end if the original had one
    const newContent = lines.join("\n") + (lines.length > 0 ? "\n" : "");
    fs.writeFileSync(filePath, newContent, "utf-8");

    return sendSuccess(res, null, "Log entry deleted successfully");
  } catch (error) {
    logger.error("Error deleting log entry:", error);
    if (error instanceof Error && error.message === "Invalid file path") {
      return sendError(res, 400, "Invalid file name");
    }
    return sendError(res, 500, "Server Error deleting log entry");
  }
};

// ==================== ACT AS ROLE (FOR SUPER_ADMIN) ====================

export const actAsRole = async (req: Request, res: Response) => {
  try {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") {
        headers[key] = value;
      } else if (Array.isArray(value)) {
        headers[key] = value.join(";");
      }
    }

    const session = await auth.api.getSession({ headers }) as SessionWithRole | null;

    if (!session) {
      return sendError(res, 401, "Unauthorized");
    }

    // Only super_admin can use act-as
    if (session?.role?.name !== "super_admin") {
      return sendError(res, 403, "Only super_admin can act as other roles");
    }

    const { payload } = req.body;
    const { role } = payload; // "tester" | "user" | null (to reset)

    if (!role) {
      // Clear the acting-as cookie
      res.clearCookie("acting_as_role");
      return sendSuccess(res, null, "Stopped acting as");
    }

    // Validate role
    if (role !== "tester" && role !== "user") {
      return sendError(res, 400, "Role must be 'tester' or 'user'");
    }

    // Set the acting-as cookie
    res.cookie("acting_as_role", role, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 1000, // 1 hour
    });

    return sendSuccess(res, { actingAsRole: role }, `Acting as ${role}`);
  } catch (error) {
    logger.error("Error in actAsRole:", error);
    return sendError(res, 500, "Server error");
  }
};
