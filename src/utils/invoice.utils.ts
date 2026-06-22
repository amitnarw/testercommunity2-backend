import { prismaClient, Prisma } from "@/lib/prisma";

/**
 * INVOICE NUMBER FORMAT
 * Format: GXITIND25J0012
 * - GXIT  = fixed prefix
 * - IND   = type (IND for India, EXP for foreign)
 * - 25    = fiscal year start (Apr-Mar). Eg: FY 2025-26 → 25
 * - J     = month letter (A=Jan, B=Feb, C=Mar, D=Apr, E=May, F=Jun,
 *           G=Jul, H=Aug, I=Sep, J=Oct, K=Nov, L=Dec)
 * - 0012  = 4-digit auto-incrementing sequence per prefix
 */

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];

const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];

function convertBelowThousand(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ONES[n];
  if (n < 100) {
    const ten = Math.floor(n / 10);
    const one = n % 10;
    return TENS[ten] + (one ? " " + ONES[one] : "");
  }
  const hundred = Math.floor(n / 100);
  const remainder = n % 100;
  return ONES[hundred] + " Hundred" + (remainder ? " and " + convertBelowThousand(remainder) : "");
}

function convertIndianAmount(amount: number): string {
  if (amount === 0) return "";
  if (amount < 100) return convertBelowThousand(amount);

  const parts: string[] = [];

  const crores = Math.floor(amount / 10000000);
  if (crores > 0) {
    parts.push(convertBelowThousand(crores) + " Crore");
    amount %= 10000000;
  }

  const lakhs = Math.floor(amount / 100000);
  if (lakhs > 0) {
    parts.push(convertBelowThousand(lakhs) + " Lakh");
    amount %= 100000;
  }

  const thousands = Math.floor(amount / 1000);
  if (thousands > 0) {
    parts.push(convertBelowThousand(thousands) + " Thousand");
    amount %= 1000;
  }

  if (amount > 0) {
    parts.push(convertBelowThousand(amount));
  }

  return parts.join(" ");
}

function convertWesternAmount(amount: number): string {
  if (amount === 0) return "";

  const parts: string[] = [];

  const billions = Math.floor(amount / 1000000000);
  if (billions > 0) {
    parts.push(convertBelowThousand(billions) + " Billion");
    amount %= 1000000000;
  }

  const millions = Math.floor(amount / 1000000);
  if (millions > 0) {
    parts.push(convertBelowThousand(millions) + " Million");
    amount %= 1000000;
  }

  const thousands = Math.floor(amount / 1000);
  if (thousands > 0) {
    parts.push(convertBelowThousand(thousands) + " Thousand");
    amount %= 1000;
  }

  if (amount > 0) {
    parts.push(convertBelowThousand(amount));
  }

  return parts.join(" ");
}

export function amountToWords(amountInSmallestUnit: number, currency: string = "INR"): string {
  const isINR = currency.toUpperCase() === "INR";
  const prefix = isINR ? "Rupees" : "US Dollars";
  const fractionalName = isINR ? "Paise" : "Cents";

  const mainAmount = Math.floor(amountInSmallestUnit / 100);
  const fractionalAmount = amountInSmallestUnit % 100;

  if (mainAmount === 0 && fractionalAmount === 0) {
    return `${prefix} Zero Only`;
  }

  const parts: string[] = [];
  if (mainAmount > 0) {
    const mainWords = isINR ? convertIndianAmount(mainAmount) : convertWesternAmount(mainAmount);
    parts.push(`${prefix} ${mainWords}`);
  }
  if (fractionalAmount > 0) {
    const fracWords = isINR ? convertIndianAmount(fractionalAmount) : convertWesternAmount(fractionalAmount);
    parts.push(`${fractionalName} ${fracWords}`);
  }

  return parts.join(" and ") + " Only";
}

function getFiscalYearStartYY(date?: Date): string {
  const now = date || new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 4) {
    return (year % 100).toString().padStart(2, "0");
  } else {
    return ((year - 1) % 100).toString().padStart(2, "0");
  }
}

function getMonthLetter(date?: Date): string {
  const now = date || new Date();
  const month = now.getMonth() + 1;
  return String.fromCharCode(64 + month);
}

export async function getNextInvoiceNumber(
  type: "IND" | "EXP",
  tx?: Prisma.TransactionClient,
  date?: Date
): Promise<string> {
  const fyYY = getFiscalYearStartYY(date);
  const monthLetter = getMonthLetter(date);
  const typeLabel = type === "IND" ? "IND" : "EXP";
  const prefix = `GXIT${typeLabel}${fyYY}${monthLetter}`;

  const client = tx || prismaClient;

  const latest = await client.invoice.findFirst({
    where: { invoice_number: { startsWith: prefix } },
    orderBy: { invoice_number: "desc" },
  });

  let seq = 1;
  if (latest) {
    const lastSeq = parseInt(latest.invoice_number.slice(-4), 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  if (seq > 9999) {
    throw new Error(`Invoice sequence overflow for prefix ${prefix}`);
  }

  return `${prefix}${seq.toString().padStart(4, "0")}`;
}

export interface IndianStateData {
  numericCode: string;
  alphaCode: string;
  name: string;
}

export const INDIAN_STATES_DATA: IndianStateData[] = [
  { numericCode: "01", alphaCode: "JK", name: "Jammu and Kashmir" },
  { numericCode: "02", alphaCode: "HP", name: "Himachal Pradesh" },
  { numericCode: "03", alphaCode: "PB", name: "Punjab" },
  { numericCode: "04", alphaCode: "CH", name: "Chandigarh" },
  { numericCode: "05", alphaCode: "UK", name: "Uttarakhand" },
  { numericCode: "06", alphaCode: "HR", name: "Haryana" },
  { numericCode: "07", alphaCode: "DL", name: "Delhi" },
  { numericCode: "08", alphaCode: "RJ", name: "Rajasthan" },
  { numericCode: "09", alphaCode: "UP", name: "Uttar Pradesh" },
  { numericCode: "10", alphaCode: "BR", name: "Bihar" },
  { numericCode: "11", alphaCode: "SK", name: "Sikkim" },
  { numericCode: "12", alphaCode: "AR", name: "Arunachal Pradesh" },
  { numericCode: "13", alphaCode: "NL", name: "Nagaland" },
  { numericCode: "14", alphaCode: "MN", name: "Manipur" },
  { numericCode: "15", alphaCode: "MZ", name: "Mizoram" },
  { numericCode: "16", alphaCode: "TR", name: "Tripura" },
  { numericCode: "17", alphaCode: "ML", name: "Meghalaya" },
  { numericCode: "18", alphaCode: "AS", name: "Assam" },
  { numericCode: "19", alphaCode: "WB", name: "West Bengal" },
  { numericCode: "20", alphaCode: "JH", name: "Jharkhand" },
  { numericCode: "21", alphaCode: "OD", name: "Odisha" },
  { numericCode: "22", alphaCode: "CG", name: "Chhattisgarh" },
  { numericCode: "23", alphaCode: "MP", name: "Madhya Pradesh" },
  { numericCode: "24", alphaCode: "GJ", name: "Gujarat" },
  { numericCode: "25", alphaCode: "DD", name: "Daman and Diu" },
  { numericCode: "26", alphaCode: "DN", name: "Dadra and Nagar Haveli" },
  { numericCode: "27", alphaCode: "MH", name: "Maharashtra" },
  { numericCode: "28", alphaCode: "AP", name: "Andhra Pradesh" },
  { numericCode: "29", alphaCode: "KA", name: "Karnataka" },
  { numericCode: "30", alphaCode: "GA", name: "Goa" },
  { numericCode: "31", alphaCode: "LD", name: "Lakshadweep" },
  { numericCode: "32", alphaCode: "KL", name: "Kerala" },
  { numericCode: "33", alphaCode: "TN", name: "Tamil Nadu" },
  { numericCode: "34", alphaCode: "PY", name: "Puducherry" },
  { numericCode: "35", alphaCode: "AN", name: "Andaman and Nicobar Islands" },
  { numericCode: "36", alphaCode: "TG", name: "Telangana" },
  { numericCode: "37", alphaCode: "AP", name: "Andhra Pradesh (New)" },
  { numericCode: "38", alphaCode: "LA", name: "Ladakh" },
];

const _buildLookups = (() => {
  const stateCodeToData: Record<string, IndianStateData> = {};
  const alphaCodeToData: Record<string, IndianStateData> = {};
  const nameToData: Record<string, IndianStateData> = {};
  const nameLowerToData: Record<string, IndianStateData> = {};
  for (const s of INDIAN_STATES_DATA) {
    const key = s.numericCode;
    if (!stateCodeToData[key]) stateCodeToData[key] = s;
    if (!alphaCodeToData[s.alphaCode]) alphaCodeToData[s.alphaCode] = s;
    nameToData[s.name] = s;
    nameLowerToData[s.name.toLowerCase()] = s;
  }
  return { stateCodeToData, alphaCodeToData, nameToData, nameLowerToData };
})();

export const { stateCodeToData, alphaCodeToData, nameToData, nameLowerToData } = _buildLookups;

export const COMPANY_DETAILS = {
  name: "Gamdix Private Limited",
  legalName: "Gamdix Private Limited",
  brandName: "inTesters",
  address: {
    line1: "C/o Spring House Co-working Pvt Ltd",
    line2: "B 1/639 A Janakpuri, Janakpuri B-1",
    city: "New Delhi",
    state: "Delhi",
    pincode: "110058",
    country: "India",
  },
  fullAddress: "C/o Spring House Co-working Pvt Ltd, B 1/639 A Janakpuri, Janakpuri B-1, New Delhi, Delhi, India, 110058",
  gstin: "07AAKCG5039N1Z4",
  pan: "AAKCG5039N",
  stateCode: "07",
  stateName: "Delhi",
  sacCode: "998313",
  email: "contact@gamdix.in",
  website: "www.intesters.com",
  cin: "",
  lutNumber: "ZD070426007807A",
};

export function getStateFromGstin(gstin: string): { name: string; stateCode: string } | null {
  if (!gstin || gstin.length < 2) return null;
  const numericPrefix = gstin.substring(0, 2);
  const state = stateCodeToData[numericPrefix];
  if (state) return { name: state.name, stateCode: state.numericCode };
  return null;
}

export function getStateCodeFromName(stateName: string | null | undefined): string | null {
  if (!stateName) return null;
  const state = nameLowerToData[stateName.trim().toLowerCase()];
  return state ? state.numericCode : null;
}

export function determineInvoiceType(country: string): "IND" | "EXP" {
  return country === "India" ? "IND" : "EXP";
}

export function calculateTax(
  amountInPaise: number,
  invoiceType: "IND" | "EXP",
  customerState: string | null | undefined,
  customerStateCode?: string | null | undefined
): { taxRate: number; cgstAmount: number; sgstAmount: number; igstAmount: number; placeOfSupply: string; supplyType: string } {
  if (invoiceType === "EXP") {
    return {
      taxRate: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      placeOfSupply: "Foreign Country (96)",
      supplyType: "Export of Services",
    };
  }

  const effectiveCode = customerStateCode || getStateCodeFromName(customerState) || null;

  const isIntraState = effectiveCode === COMPANY_DETAILS.stateCode;

  if (isIntraState) {
    const cgst = Math.round(amountInPaise * 0.09);
    const sgst = Math.round(amountInPaise * 0.09);
    return {
      taxRate: 18,
      cgstAmount: cgst,
      sgstAmount: sgst,
      igstAmount: 0,
      placeOfSupply: customerState || "Delhi",
      supplyType: "Supply of Services",
    };
  }

  return {
    taxRate: 18,
    cgstAmount: 0,
    sgstAmount: 0,
    igstAmount: Math.round(amountInPaise * 0.18),
    placeOfSupply: customerState || "India",
    supplyType: "Supply of Services",
  };
}

export function formatPeriod(date: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}