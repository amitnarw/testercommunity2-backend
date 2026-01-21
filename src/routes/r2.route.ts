import Router from "express";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import { decryptPayload } from "@/middlewares/decyptPayload";
import { createUploadUrl } from "@/controllers/r2.controller";

const router = Router();

router.post(
  "/create-upload-url",
  checkAuthentication,
  decryptPayload,
  createUploadUrl,
);

export default router;
