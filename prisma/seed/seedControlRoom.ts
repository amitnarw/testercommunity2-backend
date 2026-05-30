import logger from "../../src/utils/logger";
import { prismaClient } from "../../src/lib/prisma";

const prisma = prismaClient;

export async function seedControlRoom() {
  logger.info("Seeding control room values...");

  const existing = await prisma.controlRoom.findFirst();

  if (existing) {
    await prisma.controlRoom.update({
      where: { id: existing.id },
      data: {
        profileSurveyPoints: existing.profileSurveyPoints ?? 200,
        pointsWithdrawalLimit: existing.pointsWithdrawalLimit ?? 2000,
        pointsWithdrawalThreshold: existing.pointsWithdrawalThreshold ?? 20000,
        communitySize: existing.communitySize ?? 100,
        bugsFound: existing.bugsFound ?? 554,
        proAppsTested: existing.proAppsTested ?? 55,
        communityApps: existing.communityApps ?? 106,
        uniqueDevices: existing.uniqueDevices ?? 350,
        communityPoints: existing.communityPoints ?? 25000,
      },
    });
  } else {
    await prisma.controlRoom.create({
      data: {
        profileSurveyPoints: 200,
        pointsWithdrawalLimit: 2000,
        pointsWithdrawalThreshold: 20000,
        communitySize: 100,
        bugsFound: 554,
        proAppsTested: 55,
        communityApps: 106,
        uniqueDevices: 350,
        communityPoints: 25000,
      },
    });
  }

  logger.info("Control room values seeded successfully!");
}

// function is already exported above
