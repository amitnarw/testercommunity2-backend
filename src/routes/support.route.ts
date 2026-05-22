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
  requestHumanChat,
  getActiveHumanChat,
  sendHumanMessage,
  getChatMessages,
  getAgentStatus,
  streamChat,
} from "@/controllers/support.controller";

const router = Router();

// Tickets
router.post("/tickets", checkAuthentication, decryptPayload, createTicket);
router.get("/tickets", checkAuthentication, getTickets);
router.get("/tickets/:id", checkAuthentication, getTicketById);
router.patch("/tickets/:id/status", checkAuthentication, decryptPayload, updateTicketStatus);

// AI Chat (Alex)
router.get("/chat/history", checkAuthentication, getChatHistory);
router.post("/chat/message", checkAuthentication, decryptPayload, saveChatMessage);
router.post("/chat/stream", checkAuthentication, streamChat);

// Live Chat
router.post("/human-chat/request", checkAuthentication, decryptPayload, requestHumanChat);
router.get("/human-chat/active", checkAuthentication, getActiveHumanChat);
router.post("/human-chat/send", checkAuthentication, decryptPayload, sendHumanMessage);
router.get("/human-chat/:id/messages", checkAuthentication, getChatMessages);

// Agent status (for users)
router.get("/agent-status", checkAuthentication, getAgentStatus);

export default router;
