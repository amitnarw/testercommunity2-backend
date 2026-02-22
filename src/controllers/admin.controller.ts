import { prismaClient } from "@/lib/prisma";
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

    // Build filter - always exclude DRAFT status (drafts are not submitted yet)
    const where: any = {
      status: { not: "DRAFT" },
    };

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
    const { id } = payload;
    if (!id) {
      return sendError(res, 400, "App ID is required");
    }

    const updatedApp = await prismaClient.dashboardAndHub.update({
      where: { id: parseInt(id) },
      data: {
        status: "AVAILABLE",
      },
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

    // Build where clause - always exclude DRAFT status (drafts are not submitted yet)
    const where: any = {
      status: { not: "DRAFT" },
    };

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
      where: { id: parseInt(id) },
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
      where: { id: parseInt(id) },
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
      where: { id },
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
    const { payload } = req.body;
    const { id, role } = payload;

    if (!id || !role) {
      return sendError(res, 400, "User ID and role are required");
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
      where: { id: parseInt(id) },
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
      where: { id: parseInt(id) },
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
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
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
      where: { id: parseInt(id) },
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

    // Get all users
    const users = await prismaClient.user.findMany({
      select: { id: true },
    });

    // Create notifications for all users
    const notifications = await prismaClient.notification.createMany({
      data: users.map((user) => ({
        title,
        description,
        type: type || "OTHER",
        url: url || null,
        userId: user.id,
        isActive: true,
      })),
    });

    return sendSuccess(
      res,
      { count: notifications.count },
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
    const transformedApplications = applications.map((app) => ({
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
        id,
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

    // Optional logic: if the required number of testers is reached, we can move the app to IN_TESTING.
    // However, if the admin assigns less than required, it might stay AVAILABLE.
    if (newCurrentTester > 0 && app.status === "AVAILABLE") {
      newStatus = "IN_TESTING";
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

    return sendSuccess(res, updatedApp, "Testers assigned successfully");
  } catch (error) {
    console.error("Error assigning testers:", error);
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};
