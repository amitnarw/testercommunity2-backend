import logger from "../../src/utils/logger";
import { prismaClient } from "../../src/lib/prisma";

const prisma = prismaClient;

const TESTER_EMAIL = "tester@gmail.com";
const OWNER_EMAIL = "user@gmail.com";

const now = new Date();

function daysAgo(n: number) {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  d.setHours(10, 0, 0, 0);
  return d;
}

const MOCK_APPS = [
  {
    packageName: "com.mock.skyscape",
    appName: "SkyScape Adventure",
    categoryId: 1, // Games
    appType: "PAID",
    status: "IN_TESTING",
    currentDay: 4,
    totalDay: 14,
    currentTester: 3,
    totalTester: 5,
    rewardPoints: 120,
    minimumAndroidVersion: 8.0,
    instructions: "Test all levels 1-5 and report any crashes.",
    testerStatus: "IN_PROGRESS",
    daysCompleted: 3,
    lastActivityAt: daysAgo(3),
    // currentDayToSubmit = 4, not same day, no day-4 verification -> pending "Day 4 check-in pending"
    verifications: [
      { day: 1, status: "VERIFIED", date: daysAgo(6) },
      { day: 2, status: "VERIFIED", date: daysAgo(5) },
      { day: 3, status: "VERIFIED", date: daysAgo(4) },
    ],
    feedback: 2,
    completedAt: null,
  },
  {
    packageName: "com.mock.budgetpulse",
    appName: "BudgetPulse",
    categoryId: 7, // Finance
    appType: "PAID",
    status: "IN_TESTING",
    currentDay: 4,
    totalDay: 14,
    currentTester: 4,
    totalTester: 6,
    rewardPoints: 100,
    minimumAndroidVersion: 9.0,
    instructions: "Verify expense tracking and report bugs.",
    testerStatus: "IN_PROGRESS",
    daysCompleted: 4,
    lastActivityAt: now,
    // same day, day-4 verification REJECTED -> "Verification Rejected - Please re-upload"
    verifications: [
      { day: 1, status: "VERIFIED", date: daysAgo(5) },
      { day: 2, status: "VERIFIED", date: daysAgo(4) },
      { day: 3, status: "VERIFIED", date: daysAgo(3) },
      { day: 4, status: "REJECTED", date: now, reason: "Screenshot unclear" },
    ],
    feedback: 0,
    completedAt: null,
  },
  {
    packageName: "com.mock.fotofy",
    appName: "FotoFy Editor",
    categoryId: 15, // Photo & Video
    appType: "PAID",
    status: "IN_TESTING",
    currentDay: 5,
    totalDay: 14,
    currentTester: 5,
    totalTester: 8,
    rewardPoints: 150,
    minimumAndroidVersion: 8.0,
    instructions: "Test photo filters and export features.",
    testerStatus: "IN_PROGRESS",
    daysCompleted: 5,
    lastActivityAt: now,
    // same day, day-5 verification VERIFIED -> NOT pending action, shows progress bar
    verifications: [
      { day: 1, status: "VERIFIED", date: daysAgo(7) },
      { day: 2, status: "VERIFIED", date: daysAgo(6) },
      { day: 3, status: "VERIFIED", date: daysAgo(5) },
      { day: 4, status: "VERIFIED", date: daysAgo(4) },
      { day: 5, status: "VERIFIED", date: now },
    ],
    feedback: 0,
    completedAt: null,
  },
  {
    packageName: "com.mock.mindmosaic",
    appName: "MindMosaic",
    categoryId: 6, // Education
    appType: "PAID",
    status: "REQUESTED",
    currentDay: 0,
    totalDay: 14,
    currentTester: 2,
    totalTester: 10,
    rewardPoints: 90,
    minimumAndroidVersion: 7.0,
    instructions: "Pending allocation - test once testers are assigned.",
    testerStatus: "IN_PROGRESS",
    daysCompleted: 0,
    lastActivityAt: null,
    verifications: [],
    feedback: 0,
    completedAt: null,
  },
  {
    packageName: "com.mock.zenhabits",
    appName: "ZenHabits",
    categoryId: 5, // Health & Fitness
    appType: "PAID",
    status: "COMPLETED",
    currentDay: 14,
    totalDay: 14,
    currentTester: 5,
    totalTester: 5,
    rewardPoints: 200,
    minimumAndroidVersion: 8.0,
    instructions: "Test habit tracker and reminders.",
    testerStatus: "COMPLETED",
    daysCompleted: 14,
    lastActivityAt: daysAgo(6),
    verifications: [],
    feedback: 1,
    completedAt: daysAgo(5),
  },
  {
    packageName: "com.mock.travelbuddy",
    appName: "TravelBuddy",
    categoryId: 12, // Travel
    appType: "PAID",
    status: "COMPLETED",
    currentDay: 7,
    totalDay: 7,
    currentTester: 4,
    totalTester: 4,
    rewardPoints: 80,
    minimumAndroidVersion: 8.0,
    instructions: "Test itinerary planning and offline maps.",
    testerStatus: "COMPLETED",
    daysCompleted: 7,
    lastActivityAt: daysAgo(3),
    verifications: [],
    feedback: 0,
    completedAt: daysAgo(2),
  },
];

async function seedDashboardMock() {
  logger.info("🌱 Seeding dashboard mock data...");

  const tester = await prisma.user.findUnique({ where: { email: TESTER_EMAIL } });
  const owner = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } });

  if (!tester) throw new Error(`Tester user ${TESTER_EMAIL} not found. Run seedTester first.`);
  if (!owner) throw new Error(`Owner user ${OWNER_EMAIL} not found. Run seedRoleUsers first.`);

  for (const app of MOCK_APPS) {
    const androidApp = await prisma.androidApp.upsert({
      where: { packageName: app.packageName },
      update: {
        appName: app.appName,
        appCategoryId: app.categoryId,
      },
      create: {
        appName: app.appName,
        appLogoUrl: `https://placehold.co/200?text=${encodeURIComponent(app.appName)}`,
        appScreenshotUrl1: "https://placehold.co/400x800",
        appScreenshotUrl2: "https://placehold.co/400x800",
        packageName: app.packageName,
        appCategoryId: app.categoryId,
        description: `${app.appName} - mock app for dashboard testing.`,
      },
    });

    const hub = await prisma.dashboardAndHub.upsert({
      where: { appId: androidApp.id },
      update: {
        status: app.status as any,
        currentDay: app.currentDay,
        totalDay: app.totalDay,
        currentTester: app.currentTester,
        totalTester: app.totalTester,
        rewardPoints: app.rewardPoints,
        testingEndDate: app.completedAt ?? null,
      },
      create: {
        appId: androidApp.id,
        appOwnerId: owner.id,
        appType: "PAID",
        status: app.status as any,
        currentDay: app.currentDay,
        totalDay: app.totalDay,
        currentTester: app.currentTester,
        totalTester: app.totalTester,
        rewardPoints: app.rewardPoints,
        costPoints: 0,
        minimumAndroidVersion: app.minimumAndroidVersion,
        instructionsForTester: app.instructions,
        testingEndDate: app.completedAt ?? null,
      },
    });

    // Delete existing relation for this tester+hub so we can recreate cleanly
    await prisma.testerRelation.deleteMany({
      where: { testerId: tester.id, dashboardAndHubId: hub.id },
    });

    const relation = await prisma.testerRelation.create({
      data: {
        testerId: tester.id,
        dashboardAndHubId: hub.id,
        status: app.testerStatus as any,
        isActive: app.testerStatus !== "COMPLETED",
        daysCompleted: app.daysCompleted,
        lastActivityAt: app.lastActivityAt ?? null,
        completedAt: app.completedAt ?? null,
        assignmentSource: "SELF_JOIN",
      },
    });

    for (const v of app.verifications) {
      await prisma.dailyTesterVerification.upsert({
        where: { testerRelationId_dayNumber: { testerRelationId: relation.id, dayNumber: v.day } },
        update: { status: v.status as any },
        create: {
          testerRelationId: relation.id,
          dayNumber: v.day,
          proofImageUrl: `https://placehold.co/800?text=Day+${v.day}`,
          status: v.status as any,
          rejectionReason: v.reason ?? null,
          verifiedAt: v.status === "REJECTED" ? null : v.date,
          createdAt: v.date,
          updatedAt: v.date,
        },
      });
    }

    // Feedback records to make feedbackCount > 0
    if (app.feedback > 0) {
      const existing = await prisma.feedback.count({
        where: { testerId: tester.id, dashboardAndHubId: hub.id },
      });
      const toCreate = app.feedback - existing;
      for (let i = 0; i < toCreate; i++) {
        await prisma.feedback.create({
          data: {
            message: `Mock feedback for ${app.appName}`,
            type: i % 2 === 0 ? "BUG" : "SUGGESTION",
            priority: i % 2 === 0 ? "HIGH" : "LOW",
            testerId: tester.id,
            dashboardAndHubId: hub.id,
          },
        });
      }
    }
  }

  // Update wallet so stats show a non-zero balance
  await prisma.userWallet.upsert({
    where: { userId: tester.id },
    update: { totalPoints: 1240, totalPackages: 6 },
    create: { userId: tester.id, totalPoints: 1240, totalPackages: 6 },
  });

  logger.info("✅ Dashboard mock data seeded!");
  logger.info(`ℹ️  Tester: ${TESTER_EMAIL}`);
  logger.info(`ℹ️  Owner: ${OWNER_EMAIL}`);
}

export { seedDashboardMock };

const isDirectRun =
  process.argv[1]?.replace(/\\/g, "/").endsWith("seed/seedDashboardMock.ts") ||
  process.argv[1]?.replace(/\\/g, "/").endsWith("seed/seedDashboardMock.js");

if (isDirectRun) {
  seedDashboardMock()
    .catch((e) => {
      logger.error("❌ Mock seed failed:", e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
