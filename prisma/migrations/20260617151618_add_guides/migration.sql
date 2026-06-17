-- CreateTable
CREATE TABLE "guide_category" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "iconName" TEXT NOT NULL DEFAULT 'FileText',
    "colorKey" TEXT NOT NULL DEFAULT 'text-blue-500',
    "bgColorKey" TEXT NOT NULL DEFAULT 'bg-blue-500/10',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guide_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guide" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "readTime" TEXT NOT NULL DEFAULT '5 min read',
    "views" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "categoryId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guide_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guide_category_slug_key" ON "guide_category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "guide_slug_key" ON "guide"("slug");

-- AddForeignKey
ALTER TABLE "guide" ADD CONSTRAINT "guide_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "guide_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
