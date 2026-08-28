-- Add RESTART_TEST to UserActionType enum (admin-restart-app)
ALTER TYPE "UserActionType" ADD VALUE IF NOT EXISTS 'RESTART_TEST';
