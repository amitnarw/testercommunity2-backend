import { type Request, type Response } from "express";
import { prismaClient } from "@/lib/prisma";
import { sendError, sendSuccess } from "@/utils/response";

export const getPublicGuides = async (req: Request, res: Response) => {
  try {
    const guides = await prismaClient.guide.findMany({
      where: { isActive: true },
      include: {
        category: true,
      },
      orderBy: { publishedAt: "desc" },
    });
    return sendSuccess(res, guides, "Guides fetched successfully");
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Failed to fetch guides",
    );
  }
};

export const getPublicGuideBySlug = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    if (!slug || typeof slug !== "string") {
      return sendError(res, 400, "Invalid slug");
    }

    const sanitizedSlug = slug.replace(/[^a-zA-Z0-9_-]/g, "");

    if (!sanitizedSlug) {
      return sendError(res, 400, "Invalid slug format");
    }

    const guide = await prismaClient.guide.update({
      where: {
        slug: sanitizedSlug,
        isActive: true,
      },
      data: {
        views: { increment: 1 },
      },
      include: {
        category: true,
      },
    });

    return sendSuccess(res, guide, "Guide fetched successfully");
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as any).code === "P2025"
    ) {
      return sendError(res, 404, "Guide not found");
    }
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Failed to fetch guide",
    );
  }
};

export const getPublicGuidesByCategory = async (req: Request, res: Response) => {
  try {
    const { categorySlug } = req.params;

    if (!categorySlug || typeof categorySlug !== "string") {
      return sendError(res, 400, "Invalid category slug");
    }

    const category = await prismaClient.guideCategory.findUnique({
      where: { slug: categorySlug, isActive: true },
    });

    if (!category) {
      return sendError(res, 404, "Category not found");
    }

    const guides = await prismaClient.guide.findMany({
      where: {
        categoryId: category.id,
        isActive: true,
      },
      include: {
        category: true,
      },
      orderBy: { publishedAt: "desc" },
    });

    return sendSuccess(res, { category, guides }, "Guides fetched successfully");
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Failed to fetch guides",
    );
  }
};

export const getPublicGuideCategories = async (req: Request, res: Response) => {
  try {
    const categories = await prismaClient.guideCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    return sendSuccess(res, categories, "Categories fetched successfully");
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Failed to fetch categories",
    );
  }
};

export const searchPublicGuides = async (req: Request, res: Response) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== "string" || q.length < 2) {
      return sendSuccess(res, [], "No results");
    }

    const guides = await prismaClient.guide.findMany({
      where: {
        isActive: true,
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { content: { contains: q, mode: "insensitive" } },
        ],
      },
      include: {
        category: true,
      },
      orderBy: { publishedAt: "desc" },
      take: 6,
    });

    return sendSuccess(res, guides, "Search results");
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Search failed",
    );
  }
};

export const getPublicPopularGuides = async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;

    const guides = await prismaClient.guide.findMany({
      where: { isActive: true },
      orderBy: { views: "desc" },
      take: limit,
      include: {
        category: true,
      },
    });

    return sendSuccess(res, guides, "Popular guides fetched successfully");
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Failed to fetch popular guides",
    );
  }
};
