import { Router } from "express";
import {
  ingestInbound,
  listMails,
  getMailThread,
  sendMailReply,
  sendNewEmail,
  markMailRead,
  archiveMail,
  deleteMail,
  getMailUnreadCount,
  getMailCounts,
  assignMail,
} from "@/controllers/mail.controller";
import {
  listMailSenders,
  createMailSender,
  updateMailSender,
  deleteMailSender,
} from "@/controllers/mail-sender.controller";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import { checkAuthorization } from "@/middlewares/checkAuthorization";
import { decryptPayload } from "@/middlewares/decyptPayload";

const router = Router();

router.post("/inbound", ingestInbound);

router.use(checkAuthentication);

router.get("/senders", checkAuthorization({ module: "mail", action: "canReadList" }), listMailSenders);
router.post("/senders", checkAuthorization({ module: "mail", action: "canCreate" }), decryptPayload, createMailSender);
router.put("/senders/:id", checkAuthorization({ module: "mail", action: "canUpdate" }), decryptPayload, updateMailSender);
router.delete("/senders/:id", checkAuthorization({ module: "mail", action: "canUpdate" }), deleteMailSender);

router.get("/", checkAuthorization({ module: "mail", action: "canReadList" }), listMails);
router.get("/counts", checkAuthorization({ module: "mail", action: "canReadList" }), getMailCounts);
router.get("/unread-count", checkAuthorization({ module: "mail", action: "canReadList" }), getMailUnreadCount);
router.get("/:id", checkAuthorization({ module: "mail", action: "canReadSingle" }), getMailThread);
router.post("/send", checkAuthorization({ module: "mail", action: "canCreate" }), decryptPayload, sendNewEmail);
router.post("/:id/reply", checkAuthorization({ module: "mail", action: "canUpdate" }), decryptPayload, sendMailReply);
router.post("/:id/read", checkAuthorization({ module: "mail", action: "canUpdate" }), markMailRead);
router.post("/:id/archive", checkAuthorization({ module: "mail", action: "canUpdate" }), archiveMail);
router.delete("/:id", checkAuthorization({ module: "mail", action: "canUpdate" }), deleteMail);
router.post("/:id/assign", checkAuthorization({ module: "mail", action: "canUpdate" }), decryptPayload, assignMail);

export default router;
