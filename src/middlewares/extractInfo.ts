import { extractIpAddress, extractUserAgent } from "@/utils/helperFunctions";
import { type Request, type Response, type NextFunction } from "express";

export default function extractInfo(
  req: Request,
  _: Response,
  next: NextFunction
) {
  req.userIpAddress = extractIpAddress(req);
  req.userAgent = extractUserAgent(req);
  next();
}
