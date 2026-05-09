import { type Request } from "express";

export const extractIpAddress = (req: Request): string | undefined => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  return Array.isArray(ip) ? ip[0] : ip;
};

export const extractUserAgent = (req: Request): string | undefined => {
  return req.headers["user-agent"] ?? undefined;
};

export function parseTimeString(str: string): number {
  const num = parseInt(str, 10);
  const unit = str.replace(/[0-9]/g, "").toLowerCase();

  switch (unit) {
    case "s":
      return num * 1000;
    case "m":
      return num * 60 * 1000;
    case "h":
      return num * 60 * 60 * 1000;
    case "d":
      return num * 24 * 60 * 60 * 1000;
    default:
      throw new Error("Invalid time format: " + str);
  }
}

/**
 * Normalizes an R2 URL. If the URL starts with '/', it prepends the R2_MEDIA_BASE_URL.
 */
export function normalizeR2Url(url: string | undefined | null): string {
  if (!url) return "";
  const baseUrl = process.env.R2_MEDIA_BASE_URL || "";
  if (url.startsWith("/") && baseUrl) {
    return `${baseUrl}${url}`;
  }
  return url;
}

export const extractCountry = (req: Request): string => {
  const country = req.headers["cf-ipcountry"];
  return (Array.isArray(country) ? country[0] : (country as string)) || "IN";
};

