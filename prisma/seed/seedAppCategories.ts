import { prismaClient } from "../../src/lib/prisma";

const prisma = prismaClient;

const categories = [
  "Games",
  "Productivity",
  "Social",
  "Utilities",
  "Health & Fitness",
  "Education",
  "Finance",
  "Entertainment",
  "Lifestyle",
  "Business",
  "Shopping",
  "Travel",
  "Food & Drink",
  "Music",
  "Photo & Video",
  "News",
  "Sports",
  "Weather",
  "Navigation",
  "Reference",
  "Other",
];

async function seedAppCategories() {
  console.log("Start seeding app categories...");

  try {
    for (const name of categories) {
      await prisma.appCategory.upsert({
        where: { name },
        update: {}, // No updates needed if it exists
        create: {
          name,
          isActive: true,
        },
      });
    }

    console.log("App categories seeding finished.");
  } catch (error) {
    console.error("Error seeding app categories:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Allow running directly if main module
if (require.main === module) {
  seedAppCategories();
}

export { seedAppCategories };
