import { verificationEmailHtml, paymentReceiptEmailHtml } from "../src/services/email-templates";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync, writeFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "email-previews");
mkdirSync(outDir, { recursive: true });

const verification = verificationEmailHtml(
  "https://www.intesters.com/auth/verification?token=demo_token_123"
);

const receipt = paymentReceiptEmailHtml({
  amount: "999.00",
  currency: "INR",
  paymentId: "pay_demo123456789",
  description: "Android App Testing Package",
});

writeFileSync(join(outDir, "verification.html"), verification);
writeFileSync(join(outDir, "receipt.html"), receipt);

console.log("Wrote:");
console.log(`  ${join(outDir, "verification.html")}`);
console.log(`  ${join(outDir, "receipt.html")}`);
