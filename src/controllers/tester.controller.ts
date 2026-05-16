import { type Request, type Response } from "express";
import type { AuditLogPayload } from "@/types/audit_log";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient } from "@/lib/prisma";

export const getTesterProjects = async (req: Request, res: Response) => {
  try {
    const { status, appType } = req?.query;

    // Build where condition: find DashboardAndHub entries where this user is a tester
    const whereCond: any = {
      testerRelations: {
        some: {
          testerId: req?.userId,
        },
      },
    };

    // Optional: filter by tester's status in the relation
    if (status && typeof status === "string") {
      whereCond.testerRelations.some.status = status;
    }

    // Optional: filter by app type (PAID or FREE)
    if (appType && typeof appType === "string") {
      whereCond.appType = appType;
    }

    const projects = await prismaClient?.dashboardAndHub?.findMany({
      where: whereCond,
      include: {
        androidApp: {
          include: {
            appCategory: true,
            ratings: {
              where: {
                userId: req?.userId,
                ratingType: "APP",
              },
              select: {
                rating: true,
              },
            },
          },
        },
        testerRelations: {
          where: {
            testerId: req?.userId,
          },
          include: {
            dailyVerifications: {
              orderBy: {
                dayNumber: "asc",
              },
            },
          },
        },
        feedback: {
          where: {
            testerId: req?.userId,
          },
        },
        _count: {
          select: {
            feedback: true,
            testerRelations: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    // Map to a tester-friendly response
    const result = projects?.map((project) => {
      const relation = project?.testerRelations?.[0];

      return {
        id: project.id,
        appId: project.appId,
        appName: project.androidApp?.appName,
        appLogo: project.androidApp?.appLogoUrl,
        packageName: project.androidApp?.packageName,
        category: project.androidApp?.appCategory?.name,
        description: project.androidApp?.description,
        appScreenshot1: project.androidApp?.appScreenshotUrl1,
        appScreenshot2: project.androidApp?.appScreenshotUrl2,
        appType: project.appType,
        appStatus: project.status,
        testerRating: project.androidApp?.ratings?.[0]?.rating || 0,
        testerStatus: relation?.status || null,
        assignmentSource: relation?.assignmentSource || "SELF_JOIN",
        totalDay: project.totalDay,
        currentDay: project.currentDay,
        totalTester: project.totalTester,
        currentTester: project.currentTester,
        rewardPoints: project.rewardPoints,
        costPoints: project.costPoints,
        rewardMoney: project.rewardMoney,
        costMoney: project.costMoney,
        instructionsForTester: project.instructionsForTester,
        minimumAndroidVersion: project.minimumAndroidVersion,
        daysCompleted: relation?.daysCompleted || 0,
        joinedAt: relation?.joinedAt,
        completedAt: relation?.completedAt,
        lastActivityAt: relation?.lastActivityAt,
        dailyVerifications: relation?.dailyVerifications || [],
        feedbackCount: project._count?.feedback || 0,
        totalTesters: project._count?.testerRelations || 0,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      };
    });

    return sendSuccess(res, result as any, "ok");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "tester",
      action: "getTesterProjects",
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

export const rateApp = async (req: Request, res: Response) => {
  try {
    const { appId, rating } = req.body;

    if (!appId || rating === undefined) {
      return sendError(res, 400, "App ID and rating are required");
    }

    const userId = req?.userId;

    const existingRating = await prismaClient?.rating?.findFirst({
      where: {
        appId: Number(appId),
        userId: userId,
        ratingType: "APP",
      },
    });

    if (existingRating) {
      await prismaClient?.rating?.update({
        where: { id: existingRating.id },
        data: { rating: Number(rating) },
      });
    } else {
      await prismaClient?.rating?.create({
        data: {
          rating: Number(rating),
          appId: Number(appId),
          userId: userId,
          ratingType: "APP",
        },
      });
    }

    return sendSuccess(res, null, "Rating saved successfully");
  } catch (error) {
    const auditLogPayloadFail: AuditLogPayload = {
      actorId: req?.userId || "",
      actorRole: req?.role as string,
      module: "tester",
      action: "rateApp",
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

export const updateTesterAvailability = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    const { availability } = req.body.payload;

    const validStatuses = ["AVAILABLE", "BUSY", "AWAY", "DO_NOT_DISTURB"];
    if (!availability || !validStatuses.includes(availability)) {
      return sendError(
        res,
        400,
        "Invalid availability status. Must be one of: AVAILABLE, BUSY, AWAY, DO_NOT_DISTURB",
      );
    }

    const updatedDetail = await prismaClient.userDetail.update({
      where: { userId },
      data: { availability },
    });

    return sendSuccess(
      res,
      { availability: updatedDetail.availability },
      "Availability updated successfully",
    );
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const getTesterEarnings = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;

    const wallet = await prismaClient?.userWallet.findUnique({
      where: { userId },
    });

    const totalEarned = wallet?.balanceMoney ?? 0;

    // Subtract already-requested withdrawals (PENDING/APPROVED/PAID)
    const previousWithdrawals = await prismaClient?.withdrawalRequest.aggregate(
      {
        where: {
          userId,
          status: { in: ["PENDING", "APPROVED", "PAID"] },
        },
        _sum: { amount: true },
      },
    );

    const withdrawnSoFar = previousWithdrawals?._sum?.amount ?? 0;
    const availableBalance = Math.max(0, totalEarned - withdrawnSoFar);

    // Get pending (IN_PROGRESS) balance from rewardMoney
    const inProgressRelations = await prismaClient?.testerRelation.findMany({
      where: { testerId: userId, status: "IN_PROGRESS" },
      include: {
        dashboardAndHub: { select: { rewardMoney: true } },
      },
    });

    const pendingBalance =
      inProgressRelations?.reduce(
        (sum, rel) => sum + (rel.dashboardAndHub?.rewardMoney ?? 0),
        0,
      ) ?? 0;

    const pendingProjectsCount = inProgressRelations?.length ?? 0;

    return sendSuccess(
      res,
      {
        availableBalance,
        pendingBalance,
        pendingProjectsCount,
        lifetimeEarnings: totalEarned,
      },
      "ok",
    );
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const getTesterEarningHistory = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 10);
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      prismaClient?.userTransaction.findMany({
        where: {
          userId,
          transactionType: "EARNING",
        },
        include: {
          dashboardAndHub: {
            include: {
              androidApp: {
                select: { appName: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prismaClient?.userTransaction.count({
        where: {
          userId,
          transactionType: "EARNING",
        },
      }),
    ]);

    const history = transactions?.map((tx) => ({
      id: tx.id,
      date: tx.createdAt,
      project: tx.dashboardAndHub?.androidApp?.appName ?? "—",
      amount: tx.points ?? 0,
      status: tx.status, // CREDIT | DEBIT | HOLD
      action: tx.action,
    }));

    return sendSuccess(
      res,
      {
        history,
        pagination: {
          page,
          limit,
          total: total ?? 0,
          totalPages: Math.ceil((total ?? 0) / limit),
        },
      },
      "ok",
    );
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const requestWithdrawal = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    const { amount, note } = req.body;

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return sendError(res, 400, "A valid withdrawal amount is required");
    }

    const amountNum = Number(amount);

    // Check available balance (sum of rewardMoney from COMPLETED tester relations)
    const completedRelations = await prismaClient?.testerRelation.findMany({
      where: { testerId: userId, status: "COMPLETED" },
      include: {
        dashboardAndHub: { select: { rewardMoney: true } },
      },
    });

    const totalEarned =
      completedRelations?.reduce(
        (sum, rel) => sum + (rel.dashboardAndHub?.rewardMoney ?? 0),
        0,
      ) ?? 0;

    // Get already requested/paid withdrawals
    const previousWithdrawals = await prismaClient?.withdrawalRequest.aggregate(
      {
        where: {
          userId,
          status: { in: ["PENDING", "APPROVED", "PAID"] },
        },
        _sum: { amount: true },
      },
    );

    const withdrawnSoFar = previousWithdrawals?._sum?.amount ?? 0;
    const availableBalance = totalEarned - withdrawnSoFar;

    if (amountNum > availableBalance) {
      return sendError(
        res,
        400,
        `Insufficient balance. Available: ₹${availableBalance.toFixed(2)}`,
      );
    }

    const withdrawal = await prismaClient?.withdrawalRequest.create({
      data: {
        userId: userId!,
        amount: amountNum,
        currency: "INR",
        status: "PENDING",
        note: note ?? null,
      },
    });

    return sendSuccess(
      res,
      withdrawal,
      "Withdrawal request submitted successfully",
    );
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const getWithdrawalHistory = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 10);
    const skip = (page - 1) * limit;

    const [withdrawals, total] = await Promise.all([
      prismaClient?.withdrawalRequest.findMany({
        where: { userId },
        orderBy: { requestedAt: "desc" },
        skip,
        take: limit,
      }),
      prismaClient?.withdrawalRequest.count({ where: { userId } }),
    ]);

    return sendSuccess(
      res,
      {
        withdrawals,
        pagination: {
          page,
          limit,
          total: total ?? 0,
          totalPages: Math.ceil((total ?? 0) / limit),
        },
      },
      "ok",
    );
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const getTesterActivities = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 10);
    const skip = (page - 1) * limit;
    const actionType = req.query.actionType as string | undefined;

    const where: any = { userId };
    if (actionType) {
      where.actionType = actionType;
    }

    const [activities, total] = await Promise.all([
      prismaClient?.userActivity.findMany({
        where,
        include: {
          dashboardAndHub: {
            include: {
              androidApp: { select: { appName: true, appLogoUrl: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prismaClient?.userActivity.count({ where }),
    ]);

    const result = activities?.map((a) => ({
      id: a.id,
      actionType: a.actionType,
      description: a.description,
      status: a.status,
      appName: a.dashboardAndHub?.androidApp?.appName ?? null,
      appLogo: a.dashboardAndHub?.androidApp?.appLogoUrl ?? null,
      createdAt: a.createdAt,
    }));

    return sendSuccess(
      res,
      {
        activities: result,
        pagination: {
          page,
          limit,
          total: total ?? 0,
          totalPages: Math.ceil((total ?? 0) / limit),
        },
      },
      "ok",
    );
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};
