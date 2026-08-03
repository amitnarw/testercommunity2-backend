import { prismaClient } from "../lib/prisma";

interface CreateAppChatParams {
  appId: number;
  appOwnerId: string;
  appName: string;
}

export async function createAppChatIfNotExists(params: CreateAppChatParams) {
  const { appId, appOwnerId, appName } = params;

  const existingChat = await prismaClient.conversation.findFirst({
    where: {
      dashboardAndHubId: appId,
      userId: appOwnerId,
      type: "LIVE_CHAT",
      status: { in: ["OPEN", "IN_PROGRESS"] },
    },
  });

  if (existingChat) {
    return existingChat;
  }

  const chat = await prismaClient.conversation.create({
    data: {
      userId: appOwnerId,
      type: "LIVE_CHAT",
      status: "OPEN",
      subject: `App testing chat: ${appName}`,
      description: "Chat with Testing Manager for app testing assistance",
      dashboardAndHubId: appId,
      category: "TECHNICAL",
      priority: "MEDIUM",
    },
  });

  return chat;
}
