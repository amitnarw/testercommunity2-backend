import { type Request, type Response } from "express";
import { prismaClient } from "@/lib/prisma";
import { sendError, sendSuccess } from "@/utils/response";

/**
 * Get all active blog posts for public display
 * Only returns posts where isActive is true
 */
export const getPublicBlogs = async (req: Request, res: Response) => {
  console.log("getPublicBlogs called", req.query);
  try {
    const { category } = req.query;

    console.log("category filter:", category);

    // Build where clause - only active blogs
    const where: any = {
      isActive: true,
    };

    // Filter by tag/category if provided
    if (category && typeof category === "string") {
      // Use tag matching (case insensitive)
      where.tags = {
        hasSome: [category],
      };
    }

    const blogs = await prismaClient.blog.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        content: true,
        authorName: true,
        authorAvatarUrl: true,
        authorDataAiHint: true,
        imageUrl: true,
        dataAiHint: true,
        tags: true,
        viewCount: true,
        date: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        date: "desc",
      },
    });

    console.log("Blogs found:", blogs.length);
    return sendSuccess(res, blogs, "Blogs fetched successfully");
  } catch (error) {
    console.error("Error fetching public blogs:", error);
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Failed to fetch blogs",
    );
  }
};

/**
 * Get a single blog post by slug for public display
 * Only returns the post if isActive is true
 */
export const getPublicBlogBySlug = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    if (!slug || typeof slug !== "string") {
      return sendError(res, 400, "Invalid slug");
    }

    // Sanitize slug - only allow alphanumeric, hyphens, and underscores
    const sanitizedSlug = slug.replace(/[^a-zA-Z0-9_-]/g, "");

    if (!sanitizedSlug) {
      return sendError(res, 400, "Invalid slug format");
    }

    const blog = await prismaClient.blog.update({
      where: {
        slug: sanitizedSlug,
        isActive: true,
      },
      data: {
        viewCount: { increment: 1 },
      },
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        content: true,
        authorName: true,
        authorAvatarUrl: true,
        authorDataAiHint: true,
        imageUrl: true,
        dataAiHint: true,
        tags: true,
        viewCount: true,
        date: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return sendSuccess(res, blog, "Blog fetched successfully");
  } catch (error) {
    // Prisma P2025 = record not found
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as any).code === "P2025"
    ) {
      return sendError(res, 404, "Blog not found");
    }
    console.error("Error fetching blog by slug:", error);
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Failed to fetch blog",
    );
  }
};

/**
 * Get all available blog tags/categories for filtering
 */
export const getPublicBlogTags = async (req: Request, res: Response) => {
  try {
    // Get all unique tags from active blogs
    const blogs = await prismaClient.blog.findMany({
      where: {
        isActive: true,
      },
      select: {
        tags: true,
      },
    });

    // Extract and deduplicate all tags
    const allTags = new Set<string>();
    blogs.forEach((blog) => {
      blog.tags.forEach((tag) => allTags.add(tag));
    });

    const uniqueTags = Array.from(allTags).sort();

    return sendSuccess(res, uniqueTags, "Tags fetched successfully");
  } catch (error) {
    console.error("Error fetching blog tags:", error);
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Failed to fetch tags",
    );
  }
};