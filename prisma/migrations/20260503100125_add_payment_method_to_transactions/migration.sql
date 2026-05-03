-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('POINTS', 'PACKAGE', 'PROMO_FREE');

-- AlterTable
ALTER TABLE "user_transactions" ADD COLUMN     "paymentMethod" "PaymentMethod";
