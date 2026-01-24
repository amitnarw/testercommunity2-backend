-- AlterTable
ALTER TABLE "user_activity" ADD COLUMN     "feedbackId" INTEGER;

-- AddForeignKey
ALTER TABLE "user_activity" ADD CONSTRAINT "user_activity_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "feedback"("id") ON DELETE SET NULL ON UPDATE CASCADE;
