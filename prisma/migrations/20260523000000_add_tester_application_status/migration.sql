-- AlterTable
ALTER TABLE "user_detail" ADD COLUMN "application_status" TEXT;

-- Set existing testers (role name = 'tester') to APPROVED
UPDATE "user_detail" SET "application_status" = 'APPROVED'
WHERE "roleId" = (SELECT "id" FROM "role" WHERE "name" = 'tester');
