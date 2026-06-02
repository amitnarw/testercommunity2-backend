import { prismaClient, Prisma } from "@/lib/prisma";

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
  const amount = isINR ? Math.floor(amountInSmallestUnit / 100) : Math.floor(amountInSmallestUnit / 100);

  if (amount === 0) {
    const prefix = isINR ? "Rupees" : "US Dollars";
    return `${prefix} Zero Only`;
  }

  const words = isINR ? convertIndianAmount(amount) : convertWesternAmount(amount);
  const prefix = isINR ? "Rupees" : "US Dollars";
  return `${prefix} ${words} Only`;
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

export const INDIAN_STATES: Record<string, string> = {
  "AN": "Andaman and Nicobar Islands",
  "AP": "Andhra Pradesh",
  "AR": "Arunachal Pradesh",
  "AS": "Assam",
  "BR": "Bihar",
  "CG": "Chhattisgarh",
  "CH": "Chandigarh",
  "DD": "Daman and Diu",
  "DL": "Delhi",
  "DN": "Dadra and Nagar Haveli",
  "GA": "Goa",
  "GJ": "Gujarat",
  "HP": "Himachal Pradesh",
  "HR": "Haryana",
  "JH": "Jharkhand",
  "JK": "Jammu and Kashmir",
  "KA": "Karnataka",
  "KL": "Kerala",
  "LA": "Ladakh",
  "LD": "Lakshadweep",
  "MH": "Maharashtra",
  "ML": "Meghalaya",
  "MN": "Manipur",
  "MP": "Madhya Pradesh",
  "MZ": "Mizoram",
  "NL": "Nagaland",
  "OD": "Odisha",
  "PB": "Punjab",
  "PY": "Puducherry",
  "RJ": "Rajasthan",
  "SK": "Sikkim",
  "TG": "Telangana",
  "TN": "Tamil Nadu",
  "TR": "Tripura",
  "UP": "Uttar Pradesh",
  "UK": "Uttarakhand",
  "WB": "West Bengal",
};

export function getStateFromGstin(gstin: string): string | null {
  if (!gstin || gstin.length < 2) return null;
  const stateCode = gstin.substring(0, 2);
  for (const [code, name] of Object.entries(INDIAN_STATES)) {
    if (code === stateCode) return name;
  }
  return null;
}

export function determineInvoiceType(country: string): "IND" | "EXP" {
  return country === "India" ? "IND" : "EXP";
}

export function calculateTax(
  amountInPaise: number,
  invoiceType: "IND" | "EXP",
  customerState: string | null | undefined
): { taxRate: number; cgstAmount: number; sgstAmount: number; igstAmount: number; placeOfSupply: string; supplyType: string } {
  if (invoiceType === "EXP") {
    return {
      taxRate: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      placeOfSupply: "Outside India",
      supplyType: "Export of Services",
    };
  }

  const normalizedState = (customerState || "").trim().toLowerCase();
  const isDelhi = normalizedState === "delhi" || normalizedState === "dl" || normalizedState === "07";

  if (isDelhi) {
    const cgst = Math.round(amountInPaise * 0.09);
    const sgst = Math.round(amountInPaise * 0.09);
    return {
      taxRate: 18,
      cgstAmount: cgst,
      sgstAmount: sgst,
      igstAmount: 0,
      placeOfSupply: "Delhi",
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