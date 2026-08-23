import { Router } from "express";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import { decryptPayload } from "@/middlewares/decyptPayload";
import {
  sendHandshakeRequest,
  acceptHandshakeRequest,
  rejectHandshakeRequest,
  cancelHandshakeRequest,
  listHandshakeRequests,
} from "@/controllers/handshakeRequest.controller";

const router = Router();

router.post("/send", checkAuthentication, decryptPayload, sendHandshakeRequest);
router.post(
  "/:id/accept",
  checkAuthentication,
  decryptPayload,
  acceptHandshakeRequest,
);
router.post(
  "/:id/reject",
  checkAuthentication,
  decryptPayload,
  rejectHandshakeRequest,
);
router.post(
  "/:id/cancel",
  checkAuthentication,
  decryptPayload,
  cancelHandshakeRequest,
);
router.get("/", checkAuthentication, listHandshakeRequests);

export default router;
