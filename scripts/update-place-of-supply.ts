import "dotenv/config";
import { prismaClient } from "../src/lib/prisma";

async function main() {
  console.log("Updating existing invoices: changing place of supply from 'Outside India' to 'Foreign Country (96)'...");
  const result = await prismaClient.invoice.updateMany({
    where: {
      place_of_supply: "Outside India"
    },
    data: {
      place_of_supply: "Foreign Country (96)"
    }
  });
  console.log(`Updated ${result.count} existing invoices.`);
}

main()
  .catch(console.error)
  .finally(() => prismaClient.$disconnect());
