-- AlterTable
ALTER TABLE "user_detail" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "tester_devices" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "tester_os_versions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "testing_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "years_of_experience" TEXT;
