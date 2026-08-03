import logger from "../../src/utils/logger";
import { prismaClient } from "../../src/lib/prisma";

const prisma = prismaClient;

export async function seedControlRoom() {
  logger.info("Seeding control room values...");

  const existing = await prisma.controlRoom.findFirst({ orderBy: { id: 'asc' } });

  if (existing) {
    await prisma.controlRoom.update({
      where: { id: existing.id },
      data: {
        profileSurveyPoints: existing.profileSurveyPoints ?? 200,
        pointsWithdrawalLimit: existing.pointsWithdrawalLimit ?? 2000,
        pointsWithdrawalThreshold: existing.pointsWithdrawalThreshold ?? 20000,
        countriesSupported: existing.countriesSupported ?? 10,
        bugsFound: existing.bugsFound ?? 554,
        proAppsTested: existing.proAppsTested ?? 4200,
        platformUptime: existing.platformUptime ?? 99,
        uniqueDevices: existing.uniqueDevices ?? 350,
        fastTurnaround: existing.fastTurnaround ?? 48,
        alexSystemPrompt: existing.alexSystemPrompt ?? undefined,
      },
    });
  } else {
    await prisma.controlRoom.create({
      data: {
        profileSurveyPoints: 200,
        pointsWithdrawalLimit: 2000,
        pointsWithdrawalThreshold: 20000,
        countriesSupported: 10,
        bugsFound: 554,
        proAppsTested: 4200,
        platformUptime: 99,
        uniqueDevices: 350,
        fastTurnaround: 48,
      },
    });
  }

  logger.info("Control room values seeded successfully!");
}

// function is already exported above
