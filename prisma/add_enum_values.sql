-- Add missing enum values to existing NotificationType enum
-- Run this against your database to add the new notification types

-- PostgreSQL syntax to add values to existing enum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'POINTS_DEDUCTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'APP_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'APP_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TEST_INVITATION';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'GENERAL_MESSAGE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REMINDER';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ANNOUNCEMENT';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACCOUNT_UPDATE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'INSUFFICIENT_BALANCE';

-- Verify the enum values
SELECT enumlabel FROM pg_enum WHERE enumtypid = 'NotificationType'::regtype ORDER BY enumsortorder;
