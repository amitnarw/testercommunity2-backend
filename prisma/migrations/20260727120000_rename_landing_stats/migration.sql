-- Rename landing page stats columns on control_room table
ALTER TABLE "control_room" DROP COLUMN "communitySize";
ALTER TABLE "control_room" DROP COLUMN "communityApps";
ALTER TABLE "control_room" DROP COLUMN "communityPoints";
ALTER TABLE "control_room" ADD COLUMN "countriesSupported" INTEGER;
ALTER TABLE "control_room" ADD COLUMN "platformUptime" INTEGER;
ALTER TABLE "control_room" ADD COLUMN "fastTurnaround" INTEGER;
