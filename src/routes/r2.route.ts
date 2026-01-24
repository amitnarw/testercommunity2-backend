import Router from "express";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import { decryptPayload } from "@/middlewares/decyptPayload";
import { createUploadUrl, deleteFileFromR2 } from "@/controllers/r2.controller";

const router = Router();

router.post(
  "/create-upload-url",
  checkAuthentication,
  decryptPayload,
  createUploadUrl,
);
router.delete(
  "/delete-r2-file/:key",
  checkAuthentication,
  deleteFileFromR2,
);

export default router;
