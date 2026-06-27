-- CreateTable
CREATE TABLE "acesso_pagina" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secao" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acesso_pagina_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "acesso_pagina_secao_createdAt_idx" ON "acesso_pagina"("secao", "createdAt");

-- CreateIndex
CREATE INDEX "acesso_pagina_userId_idx" ON "acesso_pagina"("userId");

-- CreateIndex
CREATE INDEX "acesso_pagina_createdAt_idx" ON "acesso_pagina"("createdAt");
