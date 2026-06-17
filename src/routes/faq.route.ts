import { Router } from "express";
import { getPublicFaqs, getPublicFaqCategories } from "@/controllers/faq.controller";

const router = Router();

router.get("/faqs", getPublicFaqs);
router.get("/faqs/categories", getPublicFaqCategories);

export default router;
