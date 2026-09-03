import express from "express";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import { checkAuthorization } from "@/middlewares/checkAuthorization";
import { getOrCreateAppChat, getAppChatMessages, sendAppChatMessage, getAppChatsAdmin, deleteAppChatAdmin, backfillAppChatsAdmin, getUnreadCountAdmin, getUnreadCountUser, peekAppChat, markAppChatRead, getAppChatsCount, getAppChatsTotalUnread } from "@/controllers/appChat.controller";

const router = express.Router();

router.post("/get-or-create", checkAuthentication, getOrCreateAppChat);
router.get("/peek/:appId", checkAuthentication, peekAppChat);
router.get("/unread/:appId", checkAuthentication, getUnreadCountUser);
router.get("/messages/:conversationId", checkAuthentication, getAppChatMessages);
router.post("/send", checkAuthentication, sendAppChatMessage);
router.get("/admin/list", checkAuthentication, checkAuthorization({ module: "app_chat", action: "canReadList" }), getAppChatsAdmin);
router.get("/admin/count", checkAuthentication, checkAuthorization({ module: "app_chat", action: "canReadList" }), getAppChatsCount);
router.get("/admin/total-unread", checkAuthentication, checkAuthorization({ module: "app_chat", action: "canReadList" }), getAppChatsTotalUnread);
router.post("/admin/delete/:chatId", checkAuthentication, checkAuthorization({ module: "app_chat", action: "canDelete" }), deleteAppChatAdmin);
router.post("/admin/backfill", checkAuthentication, checkAuthorization({ module: "app_chat", action: "canCreate" }), backfillAppChatsAdmin);
router.get("/admin/unread/:appId", checkAuthentication, checkAuthorization({ module: "app_chat", action: "canReadList" }), getUnreadCountAdmin);
router.post("/read/:appId", checkAuthentication, markAppChatRead);

export default router;
