import "express";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      role?: string;
      isAdmin?: boolean;
      userIpAddress?: string;
      userAgent?: string;
    }
  }
}

export {};
