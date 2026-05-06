import { Router } from "express";
import { getPublicBlogs, getPublicBlogBySlug, getPublicBlogTags } from "@/controllers/blog.controller";
import { getPublicTestimonials } from "@/controllers/admin.controller";
import { getPublishedReviews } from "@/controllers/review.controller";

const router = Router();

// Public routes - no authentication required
router.get("/blogs", getPublicBlogs);
router.get("/blogs/:slug", getPublicBlogBySlug);
router.get("/tags", getPublicBlogTags);

// Public testimonials
router.get("/testimonials", getPublicTestimonials);

// Public published reviews
router.get("/reviews", getPublishedReviews);

export default router;