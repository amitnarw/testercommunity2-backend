-- CreateEnum
CREATE TYPE "SupportRequestType" AS ENUM ('TICKET', 'AI_CHAT', 'HUMAN_CHAT');

-- AlterTable
ALTER TABLE "control_room" ADD COLUMN     "humanChatEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "support_message" ADD COLUMN     "isAi" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "support_request" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "assignedTo" TEXT,
ADD COLUMN     "isEscalated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "type" "SupportRequestType" NOT NULL DEFAULT 'TICKET';

-- AddForeignKey
ALTER TABLE "support_request" ADD CONSTRAINT "support_request_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
