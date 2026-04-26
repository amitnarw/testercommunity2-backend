import { Router } from "express";
import { getPublicBlogs, getPublicBlogBySlug, getPublicBlogTags } from "@/controllers/blog.controller";

const router = Router();

// Public routes - no authentication required
router.get("/blogs", getPublicBlogs);
router.get("/blogs/:slug", getPublicBlogBySlug);
router.get("/tags", getPublicBlogTags);

export default router;