import { PrismaClient } from "../../prisma/generated/prisma";
// import { PrismaClient } from "@@/prisma/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

// const globalForPrisma = global as unknown as { prisma: PrismaClient };

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
export const prismaClient = new PrismaClient({ adapter });
