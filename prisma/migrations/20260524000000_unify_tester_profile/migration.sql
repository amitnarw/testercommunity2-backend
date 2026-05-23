-- Rename testing_types to areas_of_expertise
ALTER TABLE "user_detail" RENAME COLUMN "testing_types" TO "areas_of_expertise";

-- Remove tester_devices and tester_os_versions columns
ALTER TABLE "user_detail" DROP COLUMN "tester_devices";
ALTER TABLE "user_detail" DROP COLUMN "tester_os_versions";
