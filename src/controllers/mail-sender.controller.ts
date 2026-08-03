import { type Request, type Response } from "express";
import { prismaClient } from "@/lib/prisma";
import { sendError, sendSuccess } from "@/utils/response";

export const listMailSenders = async (_req: Request, res: Response) => {
  try {
    const senders = await prismaClient.mailSenderAddress.findMany({
      orderBy: { createdAt: "asc" },
    });
    return sendSuccess(res, senders, "Sender addresses fetched");
  } catch (error) {
    console.error("Error listing mail senders:", error);
    return sendError(res, 500, "Failed to list sender addresses");
  }
};

export const createMailSender = async (req: Request, res: Response) => {
  try {
    const { email, label } = req.body.payload || req.body;

    if (!email || !email.includes("@")) {
      return sendError(res, 400, "Valid email is required");
    }

    const existing = await prismaClient.mailSenderAddress.findUnique({
      where: { email },
    });
    if (existing) {
      return sendError(res, 409, "This email address already exists");
    }

    const sender = await prismaClient.mailSenderAddress.create({
      data: { email, label: label || null },
    });

    return sendSuccess(res, sender, "Sender address created");
  } catch (error) {
    console.error("Error creating mail sender:", error);
    return sendError(res, 500, "Failed to create sender address");
  }
};

export const updateMailSender = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { email, label, isActive } = req.body.payload || req.body;

    const sender = await prismaClient.mailSenderAddress.findUnique({
      where: { id: Number(id) },
    });
    if (!sender) {
      return sendError(res, 404, "Sender address not found");
    }

    if (email && email !== sender.email) {
      if (!email.includes("@")) {
        return sendError(res, 400, "Invalid email address");
      }
      const duplicate = await prismaClient.mailSenderAddress.findUnique({
        where: { email },
      });
      if (duplicate) {
        return sendError(res, 409, "This email address already exists");
      }
    }

    const updated = await prismaClient.mailSenderAddress.update({
      where: { id: Number(id) },
      data: {
        ...(email !== undefined && { email }),
        ...(label !== undefined && { label }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return sendSuccess(res, updated, "Sender address updated");
  } catch (error) {
    console.error("Error updating mail sender:", error);
    return sendError(res, 500, "Failed to update sender address");
  }
};

export const deleteMailSender = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const sender = await prismaClient.mailSenderAddress.findUnique({
      where: { id: Number(id) },
    });
    if (!sender) {
      return sendError(res, 404, "Sender address not found");
    }

    await prismaClient.mailSenderAddress.delete({
      where: { id: Number(id) },
    });

    return sendSuccess(res, null, "Sender address deleted");
  } catch (error) {
    console.error("Error deleting mail sender:", error);
    return sendError(res, 500, "Failed to delete sender address");
  }
};
