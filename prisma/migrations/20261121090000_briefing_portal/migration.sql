-- AlterTable
ALTER TABLE "briefing_projeto" ADD COLUMN     "avisoEquipeEm" TIMESTAMP(3),
ADD COLUMN     "portalEncerradoEm" TIMESTAMP(3),
ADD COLUMN     "portalEncerradoPorId" TEXT,
ADD COLUMN     "portalPedidoEm" TIMESTAMP(3),
ADD COLUMN     "portalPedidoPorId" TEXT;

-- A trava de aviso passa de LinkPublicoInput.notificadoEm para BriefingProjeto.avisoEquipeEm: copia o que já existe.
INSERT INTO "briefing_projeto" ("id", "projetoId", "avisoEquipeEm", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, l."projetoId", l."notificadoEm", now(), now()
FROM "link_publico_input" l WHERE l."notificadoEm" IS NOT NULL
ON CONFLICT ("projetoId") DO UPDATE SET "avisoEquipeEm" = EXCLUDED."avisoEquipeEm";
