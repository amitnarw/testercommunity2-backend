import Router from "express";
import multer from "multer";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import { decryptPayload } from "@/middlewares/decyptPayload";
import { createUploadUrl, uploadFileToR2 } from "@/controllers/r2.controller";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.post(
  "/create-upload-url",
  checkAuthentication,
  decryptPayload,
  createUploadUrl,
);
router.post(
  "/upload",
  checkAuthentication,
  upload.single("file"),
  uploadFileToR2,
);

// P1.3: the public DELETE /delete-r2-file/:key route was removed ,  any
// authenticated user could delete arbitrary bucket objects (keys leak via
// media URLs in API responses). Server-side cleanup keeps using the
// internal deleteFunction({url}) helper; no frontend caller existed.

export default router;
