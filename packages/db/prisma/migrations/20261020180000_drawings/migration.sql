-- UI-01 chart drawings.
-- CreateTable
CREATE TABLE "Drawing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "points" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Drawing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Drawing_userId_symbol_idx" ON "Drawing"("userId", "symbol");

-- AddForeignKey
ALTER TABLE "Drawing" ADD CONSTRAINT "Drawing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

