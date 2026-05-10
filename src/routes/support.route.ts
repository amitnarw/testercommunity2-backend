import Router from "express";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import { decryptPayload } from "@/middlewares/decyptPayload";
import {
  createTicket,
  getTickets,
  getTicketById,
  updateTicketStatus,
  getChatHistory,
  saveChatMessage,
} from "@/controllers/support.controller";

const router = Router();

router.post("/tickets", checkAuthentication, decryptPayload, createTicket);
router.get("/tickets", checkAuthentication, getTickets);
router.get("/tickets/:id", checkAuthentication, getTicketById);
router.patch("/tickets/:id/status", checkAuthentication, decryptPayload, updateTicketStatus);
router.get("/chat/history", checkAuthentication, getChatHistory);
router.post("/chat/message", checkAuthentication, decryptPayload, saveChatMessage);

export default router;
