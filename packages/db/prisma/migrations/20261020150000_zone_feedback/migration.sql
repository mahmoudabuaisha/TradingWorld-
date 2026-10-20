-- AI-02 user feedback. "ZoneFeedback" had no writers before this migration, so updatedAt is added without a default.
-- AlterTable
ALTER TABLE "ZoneFeedback" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "ZoneFeedback_userId_idx" ON "ZoneFeedback"("userId");

-- CreateIndex
CREATE INDEX "ZoneFeedback_createdAt_idx" ON "ZoneFeedback"("createdAt" DESC);

