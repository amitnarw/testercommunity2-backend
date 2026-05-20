import logger from "../../src/utils/logger";
import { prismaClient } from "../../src/lib/prisma";

const prisma = prismaClient;

export async function seedAuthors() {
  logger.info("🌱 Seeding blog authors...");

  const authors = [
    {
      name: "Alex Chen",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=AlexChen",
      bio: "Full-stack developer and tech writer with 8+ years of experience in mobile and web development. Passionate about developer tools and community building.",
      dataAiHint: "professional headshot",
    },
    {
      name: "Sarah Mitchell",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=SarahMitchell",
      bio: "QA engineer and testing specialist. Loves breaking things to make them better. Advocate for automated testing and quality-driven development.",
      dataAiHint: "professional headshot",
    },
    {
      name: "Jordan Lee",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=JordanLee",
      bio: "Product designer turned developer. Writes about UX, design systems, and the intersection of design and engineering.",
      dataAiHint: "professional headshot",
    },
    {
      name: "Priya Sharma",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=PriyaSharma",
      bio: "DevOps engineer and open-source contributor. Specializes in CI/CD, cloud infrastructure, and developer experience optimization.",
      dataAiHint: "professional headshot",
    },
  ];

  for (const author of authors) {
    await prisma.author.upsert({
      where: { name: author.name },
      update: {},
      create: author,
    });
  }

  logger.info("✅ Blog authors seeded");
}
