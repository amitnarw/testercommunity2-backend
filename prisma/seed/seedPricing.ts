import { prismaClient } from "../../src/lib/prisma";

export async function seedPricing() {
  const pricingData = [
    { country_code: 'IN', country_name: 'India', currency_code: 'INR', currency_symbol: '₹', amount: 99900 }, // ₹999
    { country_code: 'US', country_name: 'United States', currency_code: 'USD', currency_symbol: '$', amount: 1200 }, // $12
    { country_code: 'GB', country_name: 'United Kingdom', currency_code: 'GBP', currency_symbol: '£', amount: 1000 }, // £10
    { country_code: 'DE', country_name: 'Germany', currency_code: 'EUR', currency_symbol: '€', amount: 1100 }, // €11
    { country_code: 'FR', country_name: 'France', currency_code: 'EUR', currency_symbol: '€', amount: 1100 }, // €11
    { country_code: 'AU', country_name: 'Australia', currency_code: 'AUD', currency_symbol: 'A$', amount: 1800 }, // A$18
    { country_code: 'CA', country_name: 'Canada', currency_code: 'CAD', currency_symbol: 'C$', amount: 1600 }, // C$16
    { country_code: 'SG', country_name: 'Singapore', currency_code: 'SGD', currency_symbol: 'S$', amount: 1600 }, // S$16
    { country_code: 'AE', country_name: 'United Arab Emirates', currency_code: 'AED', currency_symbol: 'د.إ', amount: 4500 }, // 45 AED
    { country_code: 'JP', country_name: 'Japan', currency_code: 'JPY', currency_symbol: '¥', amount: 1800 }, // ¥1800 (Wait, JPY doesn't have subunits usually in Stripe, but Razorpay uses subunits for all. ¥1800 is roughly 1800 yen)
  ];

  for (const data of pricingData) {
    await prismaClient.pricing.upsert({
      where: { country_code: data.country_code },
      update: data,
      create: data,
    });
  }
}
