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

const enterpriseFeatures: string[] = [
  "Unlimited Testing Cycles",
  "Everything in Professional",
  "Volume Discounts",
  "Dedicated Account Manager",
  "Custom Integrations",
  "Priority Support & SLA",
  "Custom Reporting",
];

const plans = [
  {
    id: "1",
    name: "App Testing",
    price: 999,
    package: 1,
    features: professionalPathFeatures,
    description: "Hire our professional testers for guaranteed, high-quality results.",
    badgeText: "PRO TESTING",
    accent: "primary",
    gradientFrom: null,
    gradientTo: null,
customPriceLabel: null,
    customPriceSuffix: null,
     isPopular: true,
     sequence: 1,
     billingType: "ONE_TIME",
     buttonAction: "BUY",
    ctaLabel: null,
    ctaHref: null,
  },
  {
    id: "handshake",
    name: "Handshake",
    price: 99,
    package: 1,
    features: handshakeFeatures,
    description: "Monthly barter subscription, publish your app and test others in return.",
    badgeText: "HANDSHAKE",
    accent: "emerald",
    gradientFrom: null,
    gradientTo: null,
customPriceLabel: null,
    customPriceSuffix: null,
     isPopular: false,
     sequence: 0,
     billingType: "SUBSCRIPTION",
     buttonAction: "BUY",
    ctaLabel: null,
    ctaHref: null,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 0,
    package: 1,
    features: enterpriseFeatures,
    description: "Volume-based plans for organisations with multiple apps.",
    badgeText: "ENTERPRISE",
    accent: "purple",
    gradientFrom: "#8364E8",
    gradientTo: "#D397FA",
customPriceLabel: "Custom",
    customPriceSuffix: null,
     isPopular: false,
     sequence: 2,
     billingType: "CUSTOM",
     buttonAction: "REDIRECT",
    ctaLabel: "Contact Sales",
    ctaHref: "/help",
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
        description: planData.description,
        badgeText: planData.badgeText,
        accent: planData.accent,
        gradientFrom: planData.gradientFrom,
        gradientTo: planData.gradientTo,
        customPriceLabel: planData.customPriceLabel,
        customPriceSuffix: planData.customPriceSuffix,
         isPopular: planData.isPopular,
         sequence: planData.sequence,
billingType: planData.billingType,
         buttonAction: planData.buttonAction,
         isActive: true,
         ctaLabel: planData.ctaLabel,
         ctaHref: planData.ctaHref,
       },
       create: {
         id: planData.id,
         name: planData.name,
         price: planData.price,
         package: planData.package,
         features: planData.features,
         description: planData.description,
         badgeText: planData.badgeText,
         accent: planData.accent,
         gradientFrom: planData.gradientFrom,
         gradientTo: planData.gradientTo,
         customPriceLabel: planData.customPriceLabel,
         customPriceSuffix: planData.customPriceSuffix,
         isPopular: planData.isPopular,
         sequence: planData.sequence,
         billingType: planData.billingType,
         buttonAction: planData.buttonAction,
        ctaLabel: planData.ctaLabel,
        ctaHref: planData.ctaHref,
      },
    });
    logger.info(`Created/updated plan: ${plan.name} (id: ${plan.id})`);
  }

  logger.info(`Plans seeding finished.`);
}
