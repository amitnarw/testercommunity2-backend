-- AlterTable
ALTER TABLE "conversation" ADD COLUMN     "agentLastReadAt" TIMESTAMP(3),
ADD COLUMN     "ownerLastReadAt" TIMESTAMP(3);
