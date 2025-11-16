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
