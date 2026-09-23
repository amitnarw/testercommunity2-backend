import { prismaClient } from "@/lib/prisma";
import { sendSuccess, sendError } from "@/utils/response";
import { type Request, type Response } from "express";

export const getPublicFaqs = async (req: Request, res: Response) => {
  try {
    const { category } = req.query;

    const where: any = { isActive: true };
    // FaqCategory values are lowercase — validate case-sensitively and
    // ignore unknown values instead of crashing Prisma.
    if (category && typeof category === "string") {
      const normalizedCategory = category.trim();
      if (
        [
          "general",
          "community",
          "professional",
          "homepage",
          "pricing",
          "google_play_guide",
          "billing",
        ].includes(normalizedCategory)
      ) {
        where.category = normalizedCategory;
      }
    }

    const faqs = await prismaClient.faq.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    return sendSuccess(res, faqs, "FAQs fetched successfully");
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};

export const getPublicFaqCategories = async (req: Request, res: Response) => {
  try {
    const categories = await prismaClient.faq.findMany({
      where: { isActive: true },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    });

    const categoryList = categories.map((c) => c.category);
    return sendSuccess(res, categoryList, "FAQ categories fetched successfully");
  } catch (error) {
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : "Internal Server Error",
    );
  }
};
