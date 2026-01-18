import { prismaClient } from "../../src/lib/prisma";

const prisma = prismaClient;

export async function seedControlRoom() {
  console.log("Seeding control room values...");

  await prisma.controlRoom.create({
    data: {
      profileSurveyPoints: 200,
      pointsWithdrawalLimit: 2000,
      pointsWithdrawalThreshold: 20000,
    },
  });

  console.log("Control room values seeded successfully!");
}

// function is already exported above
