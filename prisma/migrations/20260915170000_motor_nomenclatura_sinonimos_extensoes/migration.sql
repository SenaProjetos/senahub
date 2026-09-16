-- Motor de reconhecimento de nomenclatura (F2 — schema + catálogos).
-- Ver `docs/superpowers/specs/2026-09-15-motor-nomenclatura.md` §3.4 e ADR-0003.
-- Toda aditiva: coluna nova sempre com DEFAULT, FK nova sempre nullable/SetNull. Segura com
-- o código da v1.17.0 (que não conhece nenhuma destas colunas) rodando ao mesmo tempo.

-- ── Sinônimos (D2) ───────────────────────────────────────────────────────────────────────────
-- Sigla alternativa que o motor resolve para o item do catálogo (ex.: "DTC" → tipo DET).
-- Não é a sigla oficial nem um cadastro à parte: mora na própria linha do catálogo.

ALTER TABLE "disciplina_catalogo" ADD COLUMN IF NOT EXISTS "sinonimos" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "prancha_catalogo" ADD COLUMN IF NOT EXISTS "sinonimos" TEXT[] NOT NULL DEFAULT '{}';

-- ── Metadados novos do documento (D5) ────────────────────────────────────────────────────────
-- tipoId/tamanhoPapelId apontam para o MESMO catálogo de `faseId` (`PranchaCatalogo` guarda as
-- três categorias); por isso as três relações do Prisma têm nome (`DocumentoFase`/`DocumentoTipo`/
-- `DocumentoTamanhoPapel`) — sem nome, `PranchaCatalogo.documentos` não saberia qual FK é qual.

ALTER TABLE "documento_disciplina" ADD COLUMN IF NOT EXISTS "tipoId" TEXT;
ALTER TABLE "documento_disciplina" ADD COLUMN IF NOT EXISTS "numeroPrancha" INTEGER;
ALTER TABLE "documento_disciplina" ADD COLUMN IF NOT EXISTS "tamanhoPapelId" TEXT;

CREATE INDEX IF NOT EXISTS "documento_disciplina_tipoId_idx" ON "documento_disciplina"("tipoId");
CREATE INDEX IF NOT EXISTS "documento_disciplina_tamanhoPapelId_idx" ON "documento_disciplina"("tamanhoPapelId");

DO $$ BEGIN
  ALTER TABLE "documento_disciplina" ADD CONSTRAINT "documento_disciplina_tipoId_fkey"
    FOREIGN KEY ("tipoId") REFERENCES "prancha_catalogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "documento_disciplina" ADD CONSTRAINT "documento_disciplina_tamanhoPapelId_fkey"
    FOREIGN KEY ("tamanhoPapelId") REFERENCES "prancha_catalogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Catálogo de extensões (§3.4) ─────────────────────────────────────────────────────────────
-- Global, sem versão por projeto. `extensao` minúscula sem ponto; "0000.rvt" representa o
-- backup numerado do Revit (`.0001.rvt`…), que é formato próprio, não revisão de projeto.

CREATE TABLE IF NOT EXISTS "extensao_arquivo" (
    "id" TEXT NOT NULL,
    "extensao" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "software" TEXT,
    "ehBackup" BOOLEAN NOT NULL DEFAULT false,
    "ehTemporario" BOOLEAN NOT NULL DEFAULT false,
    "ehConteiner" BOOLEAN NOT NULL DEFAULT false,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "extensao_arquivo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "extensao_arquivo_extensao_key" ON "extensao_arquivo"("extensao");

-- Carga inicial: só formatos confirmados no acervo de produção (2026-09-15) ou nos softwares
-- que o escritório usa (TQS, CAD, AltoQi, CYPE, Revit, Office) — fonte única em
-- `src/modules/uploads/nomenclatura/extensoes-iniciais.ts` (EXTENSOES_INICIAIS), mesma lista.
-- ON CONFLICT DO NOTHING: reexecutar (ou rodar de novo em ambiente que já tem a tabela por
-- outro caminho) não sobrescreve edição feita na tela do catálogo.
INSERT INTO "extensao_arquivo" ("id", "extensao", "categoria", "software", "ehBackup", "ehTemporario", "ehConteiner", "ordem", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'pdf', 'documento', NULL, false, false, false, 0, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'doc', 'documento', 'Office', false, false, false, 1, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'docx', 'documento', 'Office', false, false, false, 2, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'txt', 'documento', NULL, false, false, false, 3, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'rtf', 'documento', NULL, false, false, false, 4, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'xls', 'planilha', 'Office', false, false, false, 5, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'xlsx', 'planilha', 'Office', false, false, false, 6, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'xlsm', 'planilha', 'Office', false, false, false, 7, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'csv', 'planilha', NULL, false, false, false, 8, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ppt', 'apresentacao', 'Office', false, false, false, 9, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'pptx', 'apresentacao', 'Office', false, false, false, 10, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'png', 'imagem', NULL, false, false, false, 11, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'jpg', 'imagem', NULL, false, false, false, 12, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'jpeg', 'imagem', NULL, false, false, false, 13, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'dwg', 'desenho_cad', 'AutoCAD', false, false, false, 14, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'dxf', 'desenho_cad', 'AutoCAD', false, false, false, 15, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'dwt', 'desenho_cad', 'AutoCAD', false, false, false, 16, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'dws', 'desenho_cad', 'AutoCAD', false, false, false, 17, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'bak', 'temporario', 'AutoCAD', false, true, false, 18, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'dwl', 'temporario', 'AutoCAD', false, true, false, 19, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'dwl2', 'temporario', 'AutoCAD', false, true, false, 20, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'sv$', 'temporario', 'AutoCAD', false, true, false, 21, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ifc', 'modelo_bim', NULL, false, false, false, 22, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ifcxml', 'modelo_bim', NULL, false, false, false, 23, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ifczip', 'modelo_bim', NULL, false, false, true, 24, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'rvt', 'modelo_bim', 'Revit', false, false, false, 25, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'rfa', 'modelo_bim', 'Revit', false, false, false, 26, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'rte', 'modelo_bim', 'Revit', false, false, false, 27, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'rft', 'modelo_bim', 'Revit', false, false, false, 28, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '0000.rvt', 'backup_software', 'Revit', true, false, false, 29, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'qibzip', 'backup_software', 'AltoQi', true, false, true, 30, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'tqs', 'backup_software', 'TQS', true, false, false, 31, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ed3', 'backup_software', 'CYPE', true, false, false, 32, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'zip', 'compactado', NULL, false, false, true, 33, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'rar', 'compactado', NULL, false, false, true, 34, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '7z', 'compactado', NULL, false, false, true, 35, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'log', 'log', NULL, false, true, false, 36, CURRENT_TIMESTAMP)
ON CONFLICT ("extensao") DO NOTHING;

-- ── Sinônimos iniciais (D2) ──────────────────────────────────────────────────────────────────
-- Fonte: `sinonimos-iniciais.ts`. `WHERE sinonimos = '{}'` é o "só preenche vazio": não apaga
-- edição feita na tela do catálogo se este SQL for reexecutado por engano.
--
-- Disciplina: catálogo idêntico em dev e produção (conferido no diagnóstico de 2026-09-15) —
-- aplica nos dois ambientes.
UPDATE "disciplina_catalogo" SET "sinonimos" = ARRAY['HDR','ESG'] WHERE upper("codigo") = 'HID' AND "sinonimos" = '{}';
UPDATE "disciplina_catalogo" SET "sinonimos" = ARRAY['CAB'] WHERE upper("codigo") = 'LOG' AND "sinonimos" = '{}';
UPDATE "disciplina_catalogo" SET "sinonimos" = ARRAY['INC'] WHERE upper("codigo") = 'PCI' AND "sinonimos" = '{}';
UPDATE "disciplina_catalogo" SET "sinonimos" = ARRAY['ESTR'] WHERE upper("codigo") = 'EST' AND "sinonimos" = '{}';

-- Fase/tipo: só o catálogo GLOBAL (projetoId IS NULL) — é o catálogo do escritório (D1). O
-- catálogo de dev (EP/AP/PB/PE/PL/AB) usa siglas INVERTIDAS em relação à produção (PL/AP/BS/EX/
-- LG/AB) para fase, e um vocabulário de tipo diferente — estes UPDATEs casam ZERO linha em dev
-- até o catálogo de lá ser alinhado ao de produção (fora do escopo desta migration; documentado
-- em memória de projeto, não é bug desta migration).
UPDATE "prancha_catalogo" SET "sinonimos" = ARRAY['PE','EXE'] WHERE "categoria" = 'fase' AND upper("sigla") = 'EX' AND "projetoId" IS NULL AND "sinonimos" = '{}';
UPDATE "prancha_catalogo" SET "sinonimos" = ARRAY['PB'] WHERE "categoria" = 'fase' AND upper("sigla") = 'BS' AND "projetoId" IS NULL AND "sinonimos" = '{}';
UPDATE "prancha_catalogo" SET "sinonimos" = ARRAY['DTC','DE'] WHERE "categoria" = 'tipo' AND upper("sigla") = 'DET' AND "projetoId" IS NULL AND "sinonimos" = '{}';
UPDATE "prancha_catalogo" SET "sinonimos" = ARRAY['MED','MD'] WHERE "categoria" = 'tipo' AND upper("sigla") = 'MEM' AND "projetoId" IS NULL AND "sinonimos" = '{}';
UPDATE "prancha_catalogo" SET "sinonimos" = ARRAY['PLQ'] WHERE "categoria" = 'tipo' AND upper("sigla") = 'PQT' AND "projetoId" IS NULL AND "sinonimos" = '{}';
UPDATE "prancha_catalogo" SET "sinonimos" = ARRAY['LME'] WHERE "categoria" = 'tipo' AND upper("sigla") = 'LMS' AND "projetoId" IS NULL AND "sinonimos" = '{}';
