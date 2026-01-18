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
}

export { seedAppCategories };
