import { PrismaClient } from "../../prisma/generated/prisma";

// const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prismaClient = new PrismaClient();
