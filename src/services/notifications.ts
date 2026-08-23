import { prismaClient } from "@/lib/prisma";
import type { NotificationType } from "@prisma/client";

/**
 * Create a notification targeted at admins (visible only to users with
 * admin role). `userId` is left null and `isAdminOnly` is set to true.
 */
export async function createAdminNotification(opts: {
  title: string;
  description: string;
  type?: NotificationType;
  url?: string;
}): Promise<void> {
  await prismaClient.notification.create({
    data: {
      title: opts.title,
      description: opts.description,
      type: opts.type ?? "ANNOUNCEMENT",
      url: opts.url ?? null,
      userId: null,
      isAdminOnly: true,
      isActive: true,
    },
  });
}

/**
 * Create a notification targeted at a specific user.
 */
export async function createUserNotification(
  userId: string,
  opts: {
    title: string;
    description: string;
    type?: NotificationType;
    url?: string;
  },
): Promise<void> {
  await prismaClient.notification.create({
    data: {
      title: opts.title,
      description: opts.description,
      type: opts.type ?? "GENERAL_MESSAGE",
      url: opts.url ?? null,
      userId,
      isAdminOnly: false,
      isActive: true,
    },
  });
}
