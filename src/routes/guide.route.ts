import { Router } from "express";
import {
  getPublicGuides,
  getPublicGuideBySlug,
  getPublicGuidesByCategory,
  getPublicGuideCategories,
  searchPublicGuides,
  getPublicPopularGuides,
} from "@/controllers/guide.controller";

const router = Router();

router.get("/guides", getPublicGuides);
router.get("/guides/categories", getPublicGuideCategories);
router.get("/guides/popular", getPublicPopularGuides);
router.get("/guides/search", searchPublicGuides);
router.get("/guides/category/:categorySlug", getPublicGuidesByCategory);
router.get("/guides/:slug", getPublicGuideBySlug);

export default router;
