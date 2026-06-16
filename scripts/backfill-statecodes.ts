import "dotenv/config";
import { prismaClient } from "../src/lib/prisma";
import {
  getStateCodeFromName,
  calculateTax,
  amountToWords,
} from "../src/utils/invoice.utils";

async function main() {
  console.log("Starting backfill of invoice state codes...");

  const invoices = await prismaClient.invoice.findMany({
    where: { state_code: null },
    include: {
      payment: { select: { currency: true } },
      user: {
        include: {
          billingInfo: { select: { stateCode: true, state: true } },
        },
      },
    },
  });

  console.log(`Found ${invoices.length} invoices missing state_code`);

  let updated = 0;
  let skipped = 0;

  for (const invoice of invoices) {
    let stateCode = invoice.user?.billingInfo?.stateCode || null;

    if (!stateCode) {
      stateCode = getStateCodeFromName(invoice.place_of_supply);
    }

    if (!stateCode && invoice.place_of_supply && invoice.invoice_type === "IND") {
      const guessCode = getStateCodeFromName(invoice.place_of_supply);
      if (guessCode) {
        stateCode = guessCode;
      }
    }

    if (!stateCode && invoice.invoice_type === "IND") {
      console.log(`  Skipping invoice ${invoice.invoice_number}: unable to determine state code`);
      skipped++;
      continue;
    }

    if (stateCode && invoice.invoice_type === "IND") {
      const baseAmount = (invoice.unit_price || 0) * invoice.quantity;
      const taxInfo = calculateTax(baseAmount, "IND", invoice.place_of_supply || "India", stateCode);

      const totalAmount = baseAmount + taxInfo.cgstAmount + taxInfo.sgstAmount + taxInfo.igstAmount;
      const words = amountToWords(totalAmount, invoice.payment?.currency || "INR");

      await prismaClient.invoice.update({
        where: { id: invoice.id },
        data: {
          state_code: stateCode,
          cgst_amount: taxInfo.cgstAmount,
          sgst_amount: taxInfo.sgstAmount,
          igst_amount: taxInfo.igstAmount,
          tax_rate: taxInfo.taxRate,
          place_of_supply: taxInfo.placeOfSupply,
          supply_type: taxInfo.supplyType,
          amount_in_words: words,
        },
      });

      const changed = taxInfo.cgstAmount !== invoice.cgst_amount
        || taxInfo.sgstAmount !== invoice.sgst_amount
        || taxInfo.igstAmount !== invoice.igst_amount;
      if (changed) {
        console.log(`  Regenerated ${invoice.invoice_number}: stateCode=${stateCode}, CGST=${taxInfo.cgstAmount}, SGST=${taxInfo.sgstAmount}, IGST=${taxInfo.igstAmount}`);
      } else {
        console.log(`  Updated ${invoice.invoice_number}: stateCode=${stateCode} (tax unchanged)`);
      }
      updated++;
    } else {
      await prismaClient.invoice.update({
        where: { id: invoice.id },
        data: { state_code: stateCode },
      });
      console.log(`  Updated ${invoice.invoice_number}: stateCode=${stateCode} (export/no-change)`);
      updated++;
    }
  }

  console.log(`\nDone. Updated ${updated} invoices, skipped ${skipped}.`);
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(() => prismaClient.$disconnect());
