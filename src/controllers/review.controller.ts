import { prismaClient } from "@/lib/prisma";
import { sendError, sendSuccess } from "@/utils/response";
import { type Request, type Response } from "express";

export const createReview = async (req: Request, res: Response) => {
  try {
    const { payload } = req.body;
    const { rating, comment, appId } = payload;
    const userId = req.userId;

    if (!userId) return sendError(res, 401, "Unauthorized");
    if (!rating || !comment) return sendError(res, 400, "Rating and comment are required");

    const review = await prismaClient.review.create({
      data: {
        userId,
        rating: Number(rating),
        comment,
        appId: appId ? Number(appId) : null,
        status: "PENDING",
        isPublished: false,
      },
      include: { user: { select: { id: true, name: true, image: true } } },
    });

    return sendSuccess(res, review, "Review submitted successfully. Pending admin approval.");
  } catch (error) {
    return sendError(res, 500, error instanceof Error ? error.message : "Internal Server Error");
  }
};

export const getMyReviews = async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return sendError(res, 401, "Unauthorized");

    const reviews = await prismaClient.review.findMany({
      where: { userId },
      include: {
        androidApp: { select: { id: true, appName: true, appLogoUrl: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return sendSuccess(res, reviews, "Reviews fetched successfully");
  } catch (error) {
    return sendError(res, 500, error instanceof Error ? error.message : "Internal Server Error");
  }
};

export const updateReview = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = req.userId;
    const { payload } = req.body;
    const { rating, comment } = payload;

    if (!userId) return sendError(res, 401, "Unauthorized");

    const existing = await prismaClient.review.findUnique({ where: { id: parseInt(id) } });
    if (!existing) return sendError(res, 404, "Review not found");
    if (existing.userId !== userId) return sendError(res, 403, "Not your review");
    if (existing.status !== "PENDING") return sendError(res, 400, "Can only edit pending reviews");

    const updated = await prismaClient.review.update({
      where: { id: parseInt(id) },
      data: {
        rating: rating !== undefined ? Number(rating) : undefined,
        comment: comment !== undefined ? comment : undefined,
      },
    });

    return sendSuccess(res, updated, "Review updated successfully");
  } catch (error) {
    return sendError(res, 500, error instanceof Error ? error.message : "Internal Server Error");
  }
};

export const deleteMyReview = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = req.userId;

    if (!userId) return sendError(res, 401, "Unauthorized");

    const existing = await prismaClient.review.findUnique({ where: { id: parseInt(id) } });
    if (!existing) return sendError(res, 404, "Review not found");
    if (existing.userId !== userId) return sendError(res, 403, "Not your review");
    if (existing.status !== "PENDING") return sendError(res, 400, "Can only delete pending reviews");

    await prismaClient.review.delete({ where: { id: parseInt(id) } });

    return sendSuccess(res, null, "Review deleted successfully");
  } catch (error) {
    return sendError(res, 500, error instanceof Error ? error.message : "Internal Server Error");
  }
};

export const getAllReviews = async (req: Request, res: Response) => {
  try {
    const { status, search } = req.query;
    const where: any = {};

    if (status && status !== "ALL") where.status = status as string;
    if (search) {
      where.OR = [
        { comment: { contains: search as string, mode: "insensitive" } },
        { user: { name: { contains: search as string, mode: "insensitive" } } },
      ];
    }

    const reviews = await prismaClient.review.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, image: true } },
        androidApp: { select: { id: true, appName: true, appLogoUrl: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return sendSuccess(res, reviews, "Reviews fetched successfully");
  } catch (error) {
    return sendError(res, 500, error instanceof Error ? error.message : "Internal Server Error");
  }
};

export const getReviewById = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const review = await prismaClient.review.findUnique({
      where: { id: parseInt(id) },
      include: {
        user: { select: { id: true, name: true, image: true } },
        androidApp: { select: { id: true, appName: true, appLogoUrl: true } },
      },
    });

    if (!review) return sendError(res, 404, "Review not found");
    return sendSuccess(res, review, "Review fetched successfully");
  } catch (error) {
    return sendError(res, 500, error instanceof Error ? error.message : "Internal Server Error");
  }
};

export const updateReviewStatus = async (req: Request, res: Response) => {
  try {
    const { payload } = req.body;
    const { id, status, isPublished, adminNote } = payload;

    if (!id) return sendError(res, 400, "Review ID is required");
    if (status && !["PENDING", "APPROVED", "REJECTED"].includes(status)) {
      return sendError(res, 400, "Invalid status");
    }

    const updateData: any = {};
    if (status !== undefined) updateData.status = status;
    if (isPublished !== undefined) updateData.isPublished = isPublished;
    if (adminNote !== undefined) updateData.adminNote = adminNote;

    const updated = await prismaClient.review.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
    });

    return sendSuccess(res, updated, "Review status updated successfully");
  } catch (error) {
    return sendError(res, 500, error instanceof Error ? error.message : "Internal Server Error");
  }
};

export const deleteReview = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await prismaClient.review.delete({ where: { id: parseInt(id) } });
    return sendSuccess(res, null, "Review deleted successfully");
  } catch (error) {
    return sendError(res, 500, error instanceof Error ? error.message : "Internal Server Error");
  }
};

export const getPublishedReviews = async (req: Request, res: Response) => {
  try {
    const reviews = await prismaClient.review.findMany({
      where: {
        status: "APPROVED",
        isPublished: true,
      },
      include: {
        user: { select: { id: true, name: true, image: true } },
        androidApp: { select: { id: true, appName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return sendSuccess(res, reviews, "Published reviews fetched successfully");
  } catch (error) {
    return sendError(res, 500, error instanceof Error ? error.message : "Internal Server Error");
  }
};