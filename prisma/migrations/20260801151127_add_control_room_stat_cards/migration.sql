-- AlterTable
ALTER TABLE "control_room" ADD COLUMN     "landingStatDescriptions" JSONB,
ADD COLUMN     "landingStatTitles" JSONB,
ADD COLUMN     "landingStatValues" JSONB;
