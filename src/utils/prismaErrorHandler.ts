import { Prisma } from "@prisma/client";

interface ParsedError {
  userMessage: string;
  technicalMessage: string;
}

/**
 * Parses Prisma errors into user-friendly messages
 * Returns both user-facing message and technical details for developers
 */
export function parsePrismaError(error: unknown): ParsedError {
  // Default error
  const defaultResult = {
    userMessage: "Something went wrong. Please try again.",
    technicalMessage: error instanceof Error ? error.message : "Unknown error",
  };

  // Handle Prisma known errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const code = error.code;
    const meta = error.meta as Record<string, any>;

    switch (code) {
      case "P2002": // Unique constraint violation
        return {
          userMessage: "A record with this information already exists.",
          technicalMessage: `Duplicate value: ${meta?.target?.join(", ") || "field"} already exists.`,
        };

      case "P2003": // Foreign key constraint failed
        return {
          userMessage: "Invalid reference. The related record does not exist.",
          technicalMessage: `Foreign key constraint failed on field: ${meta?.field_name || "unknown"}.`,
        };

      case "P2005": // Invalid field value (including enum)
        return {
          userMessage: "Invalid value provided. Please check your input.",
          technicalMessage: `Invalid field value: ${meta?.field_name || error.message}`,
        };

      case "P2006": // Invalid value for field
        return {
          userMessage: "One or more values are invalid. Please check and try again.",
          technicalMessage: `Invalid value for field "${meta?.field_name || "unknown"}": ${error.message}`,
        };

      case "P2011": // Required value is missing
        return {
          userMessage: "Required information is missing. Please fill in all required fields.",
          technicalMessage: `Missing required field: ${meta?.field_name || "unknown"}.`,
        };

      case "P2016": // Record does not exist
        return {
          userMessage: "The requested record was not found.",
          technicalMessage: `Record not found: ${error.message}`,
        };

      case "P2025": // Record not found (delete/update)
        return {
          userMessage: "The record you are trying to modify was not found.",
          technicalMessage: `Record not found for operation. Meta: ${JSON.stringify(meta)}`,
        };

      default:
        return {
          userMessage: `Operation failed. Please try again. (Error code: ${code})`,
          technicalMessage: error.message,
        };
    }
  }

  // Handle Prisma validation errors
  if (error instanceof Prisma.PrismaClientValidationError) {
    return {
      userMessage: "Invalid data format. Please check your input and try again.",
      technicalMessage: `Validation error: ${error.message}`,
    };
  }

  // Handle Prisma unknown request errors
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return {
      userMessage: "An unexpected error occurred. Please try again.",
      technicalMessage: `Unknown request error: ${error.message}`,
    };
  }

  // Generic errors
  if (error instanceof Error) {
    // Check for specific common error patterns
    const msg = error.message.toLowerCase();

    if (msg.includes("enum") || msg.includes("expected")) {
      return {
        userMessage: "Invalid value provided. Please select a valid option.",
        technicalMessage: `Enum/validation error: ${error.message}`,
      };
    }

    if (msg.includes("not found") || msg.includes("does not exist")) {
      return {
        userMessage: "The requested resource was not found.",
        technicalMessage: error.message,
      };
    }

    if (msg.includes("connection") || msg.includes("timeout")) {
      return {
        userMessage: "Connection problem. Please check your internet and try again.",
        technicalMessage: error.message,
      };
    }
  }

  return defaultResult;
}

/**
 * @deprecated Use parsePrismaError instead
 */
export function handlePrismaError(error: unknown): ParsedError {
  return parsePrismaError(error);
}
