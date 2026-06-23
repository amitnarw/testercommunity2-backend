-- CreateTable
CREATE TABLE "immediate_attention" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "url" TEXT,
    "color" TEXT NOT NULL DEFAULT '#ef4444',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "immediate_attention_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "immediate_attention_userId_sortOrder_idx" ON "immediate_attention"("userId", "sortOrder");

-- AddForeignKey
ALTER TABLE "immediate_attention" ADD CONSTRAINT "immediate_attention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
