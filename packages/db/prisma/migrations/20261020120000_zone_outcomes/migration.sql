-- AI-01 outcome tracker. "Zone" and "ZoneOutcome" had no writers before this migration, so NOT NULL columns are added without defaults.
-- AlterTable
ALTER TABLE "Zone" ADD COLUMN     "atr" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "context" JSONB NOT NULL,
ADD COLUMN     "detectedBarTime" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "provider" TEXT NOT NULL,
ADD COLUMN     "snapshot" JSONB NOT NULL,
ALTER COLUMN "score" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "ZoneOutcome" ADD COLUMN     "barsObserved" INTEGER NOT NULL,
ADD COLUMN     "horizonBars" INTEGER NOT NULL,
ADD COLUMN     "label" TEXT NOT NULL,
ADD COLUMN     "outcomeVersion" TEXT NOT NULL,
ADD COLUMN     "reason" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Zone_provider_idx" ON "Zone"("provider");

-- CreateIndex
CREATE INDEX "ZoneOutcome_label_idx" ON "ZoneOutcome"("label");

