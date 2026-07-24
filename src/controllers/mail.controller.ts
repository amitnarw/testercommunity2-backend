import { type Request, type Response } from "express";
import { prismaClient } from "@/lib/prisma";
import { sendError, sendSuccess } from "@/utils/response";
import { sendEmail } from "@/services/resend";
import { getIO } from "@/socket/socketServer";

const MAIL_WEBHOOK_SECRET = process.env.MAIL_WEBHOOK_SECRET || "";

export const ingestInbound = async (req: Request, res: Response) => {
  try {
    const secret = req.headers["x-mail-secret"];
    if (secret !== MAIL_WEBHOOK_SECRET) {
      return sendError(res, 401, "Invalid mail webhook secret");
    }

    const { fromEmail, fromName, toAddress, subject, body, attachments, messageId, inReplyTo } = req.body;

    if (!fromEmail || !toAddress || !body) {
      return sendError(res, 400, "fromEmail, toAddress, and body are required");
    }

    const threadKey = inReplyTo || [
      [fromEmail, toAddress].sort().join("|"),
      subject?.replace(/^(Re:\s*|Fwd:\s*|Fw:\s*)/i, "").trim() || "(no subject)",
    ].join("::");

    const existingMail = await prismaClient.adminMail.findFirst({
      where: { threadKey },
      orderBy: { lastMessageAt: "desc" },
    });

    let userMatch = await prismaClient.user.findFirst({ where: { email: fromEmail } });
    if (!userMatch && fromName) {
      userMatch = await prismaClient.user.findFirst({ where: { name: fromName } });
    }

    const mailData: any = {
      threadKey,
      fromEmail,
      fromName: fromName || null,
      toAddress,
      subject: subject || "(no subject)",
      status: "UNREAD",
      lastMessageAt: new Date(),
      userId: userMatch?.id || null,
    };

    if (existingMail) {
      await prismaClient.adminMail.update({
        where: { id: existingMail.id },
        data: {
          status: "UNREAD",
          lastMessageAt: new Date(),
          userId: userMatch?.id || existingMail.userId,
        },
      });
    }

    const mail = existingMail
      ? existingMail
      : await prismaClient.adminMail.create({ data: mailData });

    await prismaClient.adminMailMessage.create({
      data: {
        mailId: mail.id,
        direction: "INBOUND",
        fromEmail,
        toEmail: toAddress,
        subject: subject || null,
        body,
        attachments: attachments || null,
        messageId: messageId || null,
        inReplyTo: inReplyTo || null,
      },
    });

    try {
      const io = getIO();
      io.of("/mail").to("admin:mail").emit("mail:new", { mailId: mail.id, fromEmail, subject: subject || "(no subject)" });
    } catch (_) {}

    return sendSuccess(res, { mailId: mail.id }, "Email ingested");
  } catch (error) {
    console.error("Error ingesting email:", error);
    return sendError(res, 500, "Failed to ingest email");
  }
};

export const listMails = async (req: Request, res: Response) => {
  try {
    const { status, toAddress, search, page = "1", limit = "50" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (status && ["UNREAD", "READ", "REPLIED", "ARCHIVED"].includes(status as string)) {
      where.status = status;
    }
    if (toAddress) {
      where.toAddress = toAddress as string;
    }
    if (search) {
      where.OR = [
        { subject: { contains: search as string, mode: "insensitive" } },
        { fromEmail: { contains: search as string, mode: "insensitive" } },
        { fromName: { contains: search as string, mode: "insensitive" } },
      ];
    }

    const [mails, total] = await Promise.all([
      prismaClient.adminMail.findMany({
        where,
        orderBy: { lastMessageAt: "desc" },
        skip,
        take: limitNum,
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
          _count: { select: { messages: true } },
        },
      }),
      prismaClient.adminMail.count({ where }),
    ]);

    return sendSuccess(res, { mails, total, page: pageNum, limit: limitNum } as any, "Mails fetched");
  } catch (error) {
    console.error("Error listing mails:", error);
    return sendError(res, 500, "Failed to list mails");
  }
};

export const getMailThread = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const mail = await prismaClient.adminMail.findUnique({
      where: { id: Number(id) },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        user: { select: { id: true, name: true, email: true, image: true } },
        assignedUser: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    if (!mail) {
      return sendError(res, 404, "Mail not found");
    }

    if (mail.status === "UNREAD") {
      await prismaClient.adminMail.update({
        where: { id: mail.id },
        data: { status: "READ" },
      });
    }

    return sendSuccess(res, mail as any, "Mail thread fetched");
  } catch (error) {
    console.error("Error fetching mail thread:", error);
    return sendError(res, 500, "Failed to fetch mail thread");
  }
};

export const sendMailReply = async (req: Request, res: Response) => {
  try {
    const { mailId, fromAddress, body, attachments } = req.body.payload || req.body;

    if (!mailId || !fromAddress || !body) {
      return sendError(res, 400, "mailId, fromAddress, and body are required");
    }

    const mail = await prismaClient.adminMail.findUnique({ where: { id: Number(mailId) } });
    if (!mail) {
      return sendError(res, 404, "Mail not found");
    }

    if (!fromAddress.includes("@")) {
      return sendError(res, 400, "Invalid fromAddress");
    }

    const emailResult = await sendEmail({
      from: `inTesters <${fromAddress}>`,
      to: mail.fromEmail,
      subject: `Re: ${mail.subject}`,
      html: body,
    });

    if (!emailResult.success) {
      return sendError(res, 500, "Failed to send email reply");
    }

    await prismaClient.adminMailMessage.create({
      data: {
        mailId: mail.id,
        direction: "OUTBOUND",
        fromEmail: fromAddress,
        toEmail: mail.fromEmail,
        subject: `Re: ${mail.subject}`,
        body,
        attachments: attachments || null,
      },
    });

    const updatedMail = await prismaClient.adminMail.update({
      where: { id: mail.id },
      data: {
        status: "REPLIED",
        lastMessageAt: new Date(),
      },
    });

    try {
      const io = getIO();
      io.of("/mail").to("admin:mail").emit("mail:updated", { mailId: mail.id, status: "REPLIED" });
    } catch (_) {}

    return sendSuccess(res, updatedMail as any, "Reply sent");
  } catch (error) {
    console.error("Error sending mail reply:", error);
    return sendError(res, 500, "Failed to send reply");
  }
};

export const markMailRead = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const mail = await prismaClient.adminMail.findUnique({ where: { id: Number(id) } });
    if (!mail) {
      return sendError(res, 404, "Mail not found");
    }

    const updated = await prismaClient.adminMail.update({
      where: { id: Number(id) },
      data: { status: "READ" },
    });

    return sendSuccess(res, updated as any, "Mail marked as read");
  } catch (error) {
    console.error("Error marking mail read:", error);
    return sendError(res, 500, "Failed to mark mail as read");
  }
};

export const archiveMail = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const mail = await prismaClient.adminMail.findUnique({ where: { id: Number(id) } });
    if (!mail) {
      return sendError(res, 404, "Mail not found");
    }

    const updated = await prismaClient.adminMail.update({
      where: { id: Number(id) },
      data: { status: "ARCHIVED" },
    });

    return sendSuccess(res, updated as any, "Mail archived");
  } catch (error) {
    console.error("Error archiving mail:", error);
    return sendError(res, 500, "Failed to archive mail");
  }
};

export const getMailUnreadCount = async (req: Request, res: Response) => {
  try {
    const count = await prismaClient.adminMail.count({ where: { status: "UNREAD" } });
    return sendSuccess(res, { count }, "Unread count fetched");
  } catch (error) {
    console.error("Error fetching unread count:", error);
    return sendError(res, 500, "Failed to fetch unread count");
  }
};

export const sendNewEmail = async (req: Request, res: Response) => {
  try {
    const { toEmail, fromAddress, subject, body } = req.body.payload || req.body;

    if (!toEmail || !fromAddress || !subject || !body) {
      return sendError(res, 400, "toEmail, fromAddress, subject, and body are required");
    }

    if (!fromAddress.includes("@") || !toEmail.includes("@")) {
      return sendError(res, 400, "Invalid email address");
    }

    const threadKey = [
      [fromAddress, toEmail].sort().join("|"),
      subject?.replace(/^(Re:\s*|Fwd:\s*|Fw:\s*)/i, "").trim() || "(no subject)",
    ].join("::");

    const existingMail = await prismaClient.adminMail.findFirst({
      where: { threadKey },
      orderBy: { lastMessageAt: "desc" },
    });

    let mail: any;

    if (existingMail) {
      mail = await prismaClient.adminMail.update({
        where: { id: existingMail.id },
        data: {
          status: "REPLIED",
          lastMessageAt: new Date(),
        },
      });
    } else {
      mail = await prismaClient.adminMail.create({
        data: {
          threadKey,
          fromEmail: fromAddress,
          toAddress: toEmail,
          subject,
          status: "REPLIED",
          lastMessageAt: new Date(),
        },
      });
    }

    await prismaClient.adminMailMessage.create({
      data: {
        mailId: mail.id,
        direction: "OUTBOUND",
        fromEmail: fromAddress,
        toEmail,
        subject,
        body,
      },
    });

    const emailResult = await sendEmail({
      from: `inTesters <${fromAddress}>`,
      to: toEmail,
      subject,
      html: body,
    });

    if (!emailResult.success) {
      console.error("Email send failed, message recorded in DB:", emailResult.error);
    }

    try {
      const io = getIO();
      io.of("/mail").to("admin:mail").emit("mail:new", { mailId: mail.id, fromEmail: fromAddress, subject });
    } catch (_) {}

    return sendSuccess(res, { ...(mail as any), emailDeliveryFailed: !emailResult.success }, "Email sent");
  } catch (error) {
    console.error("Error sending new email:", error);
    return sendError(res, 500, "Failed to send email");
  }
};

export const assignMail = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { assignedTo } = req.body.payload || req.body;

    const mail = await prismaClient.adminMail.findUnique({ where: { id: Number(id) } });
    if (!mail) {
      return sendError(res, 404, "Mail not found");
    }

    const updated = await prismaClient.adminMail.update({
      where: { id: Number(id) },
      data: { assignedTo: assignedTo || null },
    });

    return sendSuccess(res, updated as any, "Mail assigned");
  } catch (error) {
    console.error("Error assigning mail:", error);
    return sendError(res, 500, "Failed to assign mail");
  }
};
