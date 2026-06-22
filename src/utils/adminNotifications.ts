import { prismaClient } from "@/lib/prisma";

export async function createAdminTestCompletedNotification(
  dashboardAndHubId: number,
  appName: string,
  appType: "FREE" | "PAID",
) {
  const isPaid = appType === "PAID";
  const url = isPaid
    ? `/admin/submissions-paid/${dashboardAndHubId}`
    : `/admin/submissions-free/${dashboardAndHubId}`;

  await prismaClient.notification.create({
    data: {
      title: "Test Cycle Completed",
      description: `The ${appType.toLowerCase()} app "${appName}" has completed its test cycle.`,
      type: "TEST_COMPLETED",
      userId: null,
      isActive: true,
      isAdminOnly: true,
      url,
    },
  });
}
