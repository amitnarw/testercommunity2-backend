-- AlterTable
ALTER TABLE "play_store_declaration" ADD COLUMN     "adminAnswers" JSONB,
ADD COLUMN     "adminDeclarationStatus" TEXT NOT NULL DEFAULT 'DRAFT';
