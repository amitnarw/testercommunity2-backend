import Router from "express";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import { decryptPayload } from "@/middlewares/decyptPayload";
import {
  createReview,
  getMyReviews,
  updateReview,
  deleteMyReview,
} from "@/controllers/review.controller";

const router = Router();

router.post("/", checkAuthentication, decryptPayload, createReview);
router.get("/my", checkAuthentication, getMyReviews);
router.put("/:id", checkAuthentication, decryptPayload, updateReview);
router.delete("/:id", checkAuthentication, deleteMyReview);

export default router;
