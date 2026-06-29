-- CreateTable
CREATE TABLE "feedback_humor" (
    "id" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "anonimo" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_humor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_humor_createdAt_idx" ON "feedback_humor"("createdAt");

-- AddForeignKey
ALTER TABLE "feedback_humor" ADD CONSTRAINT "feedback_humor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
