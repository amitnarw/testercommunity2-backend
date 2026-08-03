import { PrismaClient, Prisma } from "@prisma/client";

import { PrismaPg } from "@prisma/adapter-pg";

// const globalForPrisma = global as unknown as { prisma: PrismaClient };

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
export const prismaClient = new PrismaClient({
  adapter,
  log: [
    { emit: "event", level: "warn" },
    { emit: "event", level: "error" },
  ],
});

prismaClient.$on("error", (e: any) => {
  if (
    e?.message?.includes("P2025") &&
    /session|account|verification/i.test(e.message)
  ) {
    return;
  }
  console.error("[prisma]", e);
});
export { Prisma };
