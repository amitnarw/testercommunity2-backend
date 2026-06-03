import logger from "../../src/utils/logger";
import { prismaClient } from "../../src/lib/prisma";

const prisma = prismaClient;

const professionalPathFeatures: string[] = [
  "14-Day Testing Cycle",
  "20+ Vetted Testers",
  "Managed by inTesters Team",
  "Detailed Bug Reports",
  "Device & OS Coverage Stats",
  "Google Play Compliance Check",
];

const plans = [
  {
    id: "1",
    name: "App Testing",
    price: 999,
    package: 1,
    features: professionalPathFeatures,
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
        isActive: true,
      },
      create: {
        id: planData.id,
        name: planData.name,
        price: planData.price,
        package: planData.package,
        features: planData.features,
      },
    });
    logger.info(`Created/updated plan: ${plan.name} (id: ${plan.id})`);
  }

  logger.info(`Plans seeding finished.`);
}
