-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('AI_CHAT', 'LIVE_CHAT', 'TICKET');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_AGENT', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ConversationPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ConversationCategory" AS ENUM ('GENERAL', 'TECHNICAL', 'BILLING', 'ACCOUNT', 'BUG_REPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "MessageSenderType" AS ENUM ('USER', 'AGENT', 'AI', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'SYSTEM', 'TRANSFER_NOTICE', 'TICKET_CREATED');

-- CreateEnum
CREATE TYPE "AgentOnlineStatus" AS ENUM ('ONLINE', 'AWAY', 'OFFLINE');

-- AlterTable
ALTER TABLE "media" ADD COLUMN     "conversationId" INTEGER,
ADD COLUMN     "messageId" INTEGER;

-- CreateTable
CREATE TABLE "conversation" (
    "id" SERIAL NOT NULL,
    "type" "ConversationType" NOT NULL DEFAULT 'AI_CHAT',
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "ConversationPriority" NOT NULL DEFAULT 'MEDIUM',
    "category" "ConversationCategory" NOT NULL DEFAULT 'GENERAL',
    "subject" TEXT,
    "description" TEXT,
    "userId" TEXT,
    "assignedTo" TEXT,
    "isEscalated" BOOLEAN NOT NULL DEFAULT false,
    "assignedAt" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message" (
    "id" SERIAL NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "senderId" TEXT,
    "senderType" "MessageSenderType" NOT NULL,
    "messageType" "MessageType" NOT NULL DEFAULT 'TEXT',
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "isAi" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_status" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AgentOnlineStatus" NOT NULL DEFAULT 'OFFLINE',
    "currentChats" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_status_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversation_userId_idx" ON "conversation"("userId");

-- CreateIndex
CREATE INDEX "conversation_assignedTo_idx" ON "conversation"("assignedTo");

-- CreateIndex
CREATE INDEX "conversation_status_idx" ON "conversation"("status");

-- CreateIndex
CREATE INDEX "conversation_type_idx" ON "conversation"("type");

-- CreateIndex
CREATE INDEX "conversation_createdAt_idx" ON "conversation"("createdAt");

-- CreateIndex
CREATE INDEX "message_conversationId_idx" ON "message"("conversationId");

-- CreateIndex
CREATE INDEX "message_createdAt_idx" ON "message"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "agent_status_userId_key" ON "agent_status"("userId");

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_status" ADD CONSTRAINT "agent_status_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
