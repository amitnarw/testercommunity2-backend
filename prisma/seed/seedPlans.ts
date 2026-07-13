import logger from "../../src/utils/logger";
import { prismaClient } from "../../src/lib/prisma";

const prisma = prismaClient;

const professionalPathFeatures: string[] = [
  "15-20 Days Testing Cycle",
  "15-25 Vetted Testers",
  "Google Play Production Answers",
  "Managed by inTesters Team",
  "Detailed Bug Reports",
  "Device & OS Coverage Stats",
  "Google Play Compliance Check",
];

const handshakeFeatures: string[] = [
  "Publish and join handshake tests",
  "Gamified levels with more test slots",
  "No per-tester points required",
  "Barter-based, you test theirs, they test yours",
];

const plans = [
  {
    id: "1",
    name: "App Testing",
    price: 999,
    package: 1,
    features: professionalPathFeatures,
    billingType: "ONE_TIME",
  },
  {
    id: "handshake",
    name: "Handshake",
    price: 99,
    package: 1,
    features: handshakeFeatures,
    billingType: "SUBSCRIPTION",
  },
];

export async function seedPlans() {
  logger.info(`Start seeding plans...`);

  // Remove all existing plans before inserting fresh data
  await prisma.plans.deleteMany();
  logger.info(`Cleared existing plans.`);

  for (const planData of plans) {
    const plan = await prisma.plans.upsert({
      where: { id: planData.id },
      update: {
        name: planData.name,
        price: planData.price,
        package: planData.package,
        features: planData.features,
        billingType: planData.billingType,
        isActive: true,
      },
      create: {
        id: planData.id,
        name: planData.name,
        price: planData.price,
        package: planData.package,
        features: planData.features,
        billingType: planData.billingType,
      },
    });
    logger.info(`Created/updated plan: ${plan.name} (id: ${plan.id})`);
  }

  logger.info(`Plans seeding finished.`);
}
