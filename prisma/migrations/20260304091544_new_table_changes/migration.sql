-- CreateTable
CREATE TABLE "promo_code" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "fixedPoints" DOUBLE PRECISION NOT NULL DEFAULT 200,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxUses" INTEGER,
    "maxPerUser" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promo_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_promo_usage" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "promoCodeId" INTEGER NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "user_promo_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "promo_code_code_key" ON "promo_code"("code");

-- CreateIndex
CREATE UNIQUE INDEX "user_promo_usage_userId_promoCodeId_key" ON "user_promo_usage"("userId", "promoCodeId");

-- AddForeignKey
ALTER TABLE "user_promo_usage" ADD CONSTRAINT "user_promo_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_promo_usage" ADD CONSTRAINT "user_promo_usage_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "promo_code"("id") ON DELETE CASCADE ON UPDATE CASCADE;
