import "express";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      role?: string;
      userIpAddress?: string;
      userAgent?: string;
    }
  }
}

export {};
