import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const welcomePromo = await prisma.promoCode.upsert({
    where: { code: "welcome200" },
    update: {
      isActive: true,
      fixedPoints: 200,
    },
    create: {
      code: "welcome200",
      fixedPoints: 200,
      isActive: true,
      maxUses: 1000,
      maxPerUser: 1,
    },
  });
  console.log("Seed successful:", welcomePromo);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
