-- Histórico por documento (alterações + acessos). Ver `DocumentoEvento` em schema.prisma.
CREATE TABLE IF NOT EXISTS "documento_evento" (
    "id" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "uploadId" TEXT,
    "tipo" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'interno',
    "userId" TEXT,
    "linkId" TEXT,
    "detalhe" JSONB,
    "chaveAgrupamento" TEXT,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "auditLogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "documento_evento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "documento_evento_chaveAgrupamento_key" ON "documento_evento"("chaveAgrupamento");
CREATE UNIQUE INDEX IF NOT EXISTS "documento_evento_auditLogId_key" ON "documento_evento"("auditLogId");
CREATE INDEX IF NOT EXISTS "documento_evento_documentoId_createdAt_idx" ON "documento_evento"("documentoId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "documento_evento" ADD CONSTRAINT "documento_evento_documentoId_fkey"
    FOREIGN KEY ("documentoId") REFERENCES "documento_disciplina"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Concede `arquivos:ver_acessos` (ver quem baixou/visualizou um documento) aos perfis semente
-- de gestão: `coordenador` (papel supervisor) e `administrativo` — decisão do dono em 2026-09-15.
-- Par NOVO não chega sozinho a perfil existente: `seedPerfisAcesso` é create-only (modelo:
-- 20260902120000_perfis_tarefas_ver). Não há par equivalente para derivar (quem valida arquivo
-- é só o coordenador), então a lista é explícita. `admin` não tem perfil (é `superUsuario`).
-- ON CONFLICT DO NOTHING: idempotente e não sobrescreve revogação feita na tela.
INSERT INTO "permissao_perfil" ("id", "perfilId", "recurso", "acao", "permitido")
SELECT gen_random_uuid()::text, p."id", 'arquivos', 'ver_acessos', true
FROM "perfil_acesso" p
WHERE p."chave" IN ('coordenador', 'administrativo')
ON CONFLICT ("perfilId", "recurso", "acao") DO NOTHING;
