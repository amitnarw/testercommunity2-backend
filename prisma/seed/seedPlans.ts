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
    name: "Booster",
    price: 699,
    package: 1,
    features: professionalPathFeatures,
  },
  {
    id: "2",
    name: "Accelerator",
    price: 1799,
    package: 5,
    features: professionalPathFeatures,
  },
  {
    id: "3",
    name: "Launchpad",
    price: 2899,
    package: 10,
    features: professionalPathFeatures,
  },
];

export async function seedPlans() {
  console.log(`Start seeding plans...`);

  for (const planData of plans) {
    const plan = await prisma.plans.upsert({
      where: { id: planData.id },
      update: {},
      create: {
        id: planData.id,
        name: planData.name,
        price: planData.price,
        package: planData.package,
        features: planData.features,
      },
    });
    console.log(`Created/updated plan with id: ${plan.id}`);
  }

  console.log(`Plans seeding finished.`);
}
