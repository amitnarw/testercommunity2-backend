import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";
import fs from "fs";

// Ensure logs directory exists
const logDir = "logs";
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const logLevel = process.env.LOG_LEVEL || "info";
const nodeEnv = process.env.NODE_ENV || "development";

// Define standard log format for daily rotate and production logs
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
);

// Console format for development: readable and colorized
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  }),
);

const transports: winston.transport[] = [
  // Always log to console depending on the environment
  new winston.transports.Console({
    format: nodeEnv === "production" ? logFormat : consoleFormat,
  }),
];

// Add daily rotating file transports
transports.push(
  // Error log rotation
  new DailyRotateFile({
    filename: path.join(logDir, "error-%DATE%.log"),
    datePattern: "YYYY-MM-DD",
    level: "error",
    maxSize: "5m",
    maxFiles: "14d", // Keep logs for 14 days
    zippedArchive: true,
  }),

  // Combined log rotation
  new DailyRotateFile({
    filename: path.join(logDir, "combined-%DATE%.log"),
    datePattern: "YYYY-MM-DD",
    maxSize: "5m",
    maxFiles: "14d",
    zippedArchive: true,
  }),
);

export const logger = winston.createLogger({
  level: logLevel,
  format: logFormat,
  defaultMeta: { service: "testercommunity-backend" },
  transports,
  // Handle uncaught exceptions and unhandled rejections cleanly
  exceptionHandlers: [
    new DailyRotateFile({
      filename: path.join(logDir, "exceptions-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxSize: "5m",
      maxFiles: "14d",
      zippedArchive: true,
    }),
    new winston.transports.Console({
      format: nodeEnv === "production" ? logFormat : consoleFormat,
    }),
  ],
  rejectionHandlers: [
    new DailyRotateFile({
      filename: path.join(logDir, "rejections-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxSize: "5m",
      maxFiles: "14d",
      zippedArchive: true,
    }),
    new winston.transports.Console({
      format: nodeEnv === "production" ? logFormat : consoleFormat,
    }),
  ],
});

export default logger;
