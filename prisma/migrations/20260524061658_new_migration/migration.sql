-- AlterTable
ALTER TABLE "billing_info" ADD COLUMN     "city" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "zipCode" TEXT;

-- AlterTable
ALTER TABLE "invoice" ADD COLUMN     "amount_in_words" TEXT,
ADD COLUMN     "cgst_amount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "due_date" TIMESTAMP(3),
ADD COLUMN     "igst_amount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "invoice_type" TEXT NOT NULL DEFAULT 'IND',
ADD COLUMN     "lut_number" TEXT,
ADD COLUMN     "period" TEXT,
ADD COLUMN     "place_of_supply" TEXT,
ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "sac_code" TEXT NOT NULL DEFAULT '998313',
ADD COLUMN     "sgst_amount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "supply_type" TEXT,
ADD COLUMN     "tax_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "unit_price" INTEGER;

-- CreateTable
CREATE TABLE "author" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "bio" TEXT,
    "dataAiHint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "author_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "author_name_key" ON "author"("name");
