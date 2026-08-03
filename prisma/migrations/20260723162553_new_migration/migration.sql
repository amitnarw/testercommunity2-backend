/*
  Warnings:

  - You are about to drop the column `handshakeSubscriptionId` on the `invoice` table. All the data in the column will be lost.
  - You are about to drop the column `paymentType` on the `invoice` table. All the data in the column will be lost.
  - You are about to drop the column `handshakeSubscriptionId` on the `refund` table. All the data in the column will be lost.
  - You are about to drop the column `paymentType` on the `refund` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "MailStatus" AS ENUM ('UNREAD', 'READ', 'REPLIED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MailDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- DropForeignKey
ALTER TABLE "invoice" DROP CONSTRAINT "invoice_handshakeSubscriptionId_fkey";

-- DropForeignKey
ALTER TABLE "refund" DROP CONSTRAINT "refund_handshakeSubscriptionId_fkey";

-- DropIndex
DROP INDEX "payment_paymentType_idx";

-- AlterTable
ALTER TABLE "invoice" DROP COLUMN "handshakeSubscriptionId",
DROP COLUMN "paymentType";

-- AlterTable
ALTER TABLE "payment" ALTER COLUMN "paymentType" SET DEFAULT 'ONE_TIME';

-- AlterTable
ALTER TABLE "refund" DROP COLUMN "handshakeSubscriptionId",
DROP COLUMN "paymentType";

-- CreateTable
CREATE TABLE "admin_mail" (
    "id" SERIAL NOT NULL,
    "threadKey" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "MailStatus" NOT NULL DEFAULT 'UNREAD',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedTo" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_mail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_mail_message" (
    "id" SERIAL NOT NULL,
    "mailId" INTEGER NOT NULL,
    "direction" "MailDirection" NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "attachments" JSONB,
    "messageId" TEXT,
    "inReplyTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_mail_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_mail_status_idx" ON "admin_mail"("status");

-- CreateIndex
CREATE INDEX "admin_mail_toAddress_idx" ON "admin_mail"("toAddress");

-- CreateIndex
CREATE INDEX "admin_mail_threadKey_idx" ON "admin_mail"("threadKey");

-- CreateIndex
CREATE INDEX "admin_mail_assignedTo_idx" ON "admin_mail"("assignedTo");

-- CreateIndex
CREATE INDEX "admin_mail_userId_idx" ON "admin_mail"("userId");

-- CreateIndex
CREATE INDEX "admin_mail_message_mailId_idx" ON "admin_mail_message"("mailId");

-- CreateIndex
CREATE INDEX "admin_mail_message_messageId_idx" ON "admin_mail_message"("messageId");

-- AddForeignKey
ALTER TABLE "admin_mail" ADD CONSTRAINT "admin_mail_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_mail" ADD CONSTRAINT "admin_mail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_mail_message" ADD CONSTRAINT "admin_mail_message_mailId_fkey" FOREIGN KEY ("mailId") REFERENCES "admin_mail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "user_transactions_razorpay_payment_id_idx" RENAME TO "user_transactions_razorpayPaymentId_idx";
