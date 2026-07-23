import { Router } from "express";
import {
  ingestInbound,
  listMails,
  getMailThread,
  sendMailReply,
  markMailRead,
  archiveMail,
  getMailUnreadCount,
  assignMail,
} from "@/controllers/mail.controller";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import { checkAuthorization } from "@/middlewares/checkAuthorization";
import { decryptPayload } from "@/middlewares/decyptPayload";

const router = Router();

router.post("/inbound", ingestInbound);

router.use(checkAuthentication);

router.get("/", checkAuthorization({ module: "mail", action: "canReadList" }), listMails);
router.get("/unread-count", checkAuthorization({ module: "mail", action: "canReadList" }), getMailUnreadCount);
router.get("/:id", checkAuthorization({ module: "mail", action: "canReadSingle" }), getMailThread);
router.post("/:id/reply", checkAuthorization({ module: "mail", action: "canUpdate" }), decryptPayload, sendMailReply);
router.post("/:id/read", checkAuthorization({ module: "mail", action: "canUpdate" }), markMailRead);
router.post("/:id/archive", checkAuthorization({ module: "mail", action: "canUpdate" }), archiveMail);
router.post("/:id/assign", checkAuthorization({ module: "mail", action: "canUpdate" }), decryptPayload, assignMail);

export default router;
