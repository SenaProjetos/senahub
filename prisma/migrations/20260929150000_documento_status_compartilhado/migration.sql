-- Status documental: "Compartilhado", chave estável e cor (reunião de 29/09/2026).
--
-- `chave` é o que a automação procura: revisão nova → "enviado", prancha validada → "aprovado", e as
-- pastas do cliente ("compartilhado", "liberado_obra"). O nome continua sendo do escritório.
-- `cor` guarda o nome de um token do design system, não hex (mapa em modules/uploads/status-documento.ts).
--
-- Aditiva: coluna nullable, um INSERT idempotente e UPDATEs que só preenchem o que está vazio
-- (`cor` já escolhida não é sobrescrita). Status renomeado à mão fica sem chave e a automação
-- simplesmente não o toca.

-- AlterTable
ALTER TABLE "documento_status" ADD COLUMN "chave" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "documento_status_chave_key" ON "documento_status"("chave");

-- Status novo: entre "Aprovado com ressalvas" e "Liberado para obra".
INSERT INTO "documento_status" ("id", "nome", "ordem", "final", "ativo")
VALUES ('docstatus_compartilhado', 'Compartilhado', 6, false, true)
ON CONFLICT ("nome") DO NOTHING;

UPDATE "documento_status" SET "chave" = 'em_elaboracao',       "ordem" = 0, "cor" = COALESCE("cor", 'neutro')     WHERE "nome" = 'Em elaboração'          AND "chave" IS NULL;
UPDATE "documento_status" SET "chave" = 'enviado',             "ordem" = 1, "cor" = COALESCE("cor", 'aguardando') WHERE "nome" = 'Enviado'                AND "chave" IS NULL;
UPDATE "documento_status" SET "chave" = 'em_analise',          "ordem" = 2, "cor" = COALESCE("cor", 'andamento')  WHERE "nome" = 'Em análise'             AND "chave" IS NULL;
UPDATE "documento_status" SET "chave" = 'correcao_solicitada', "ordem" = 3, "cor" = COALESCE("cor", 'revisao')    WHERE "nome" = 'Correção solicitada'    AND "chave" IS NULL;
UPDATE "documento_status" SET "chave" = 'aprovado',            "ordem" = 4, "cor" = COALESCE("cor", 'aprovado')   WHERE "nome" = 'Aprovado'               AND "chave" IS NULL;
UPDATE "documento_status" SET "chave" = 'aprovado_ressalvas',  "ordem" = 5, "cor" = COALESCE("cor", 'entregue')   WHERE "nome" = 'Aprovado com ressalvas' AND "chave" IS NULL;
UPDATE "documento_status" SET "chave" = 'compartilhado',       "ordem" = 6, "cor" = COALESCE("cor", 'info')       WHERE "nome" = 'Compartilhado'          AND "chave" IS NULL;
UPDATE "documento_status" SET "chave" = 'liberado_obra',       "ordem" = 7, "cor" = COALESCE("cor", 'primario')   WHERE "nome" = 'Liberado para obra'     AND "chave" IS NULL;
UPDATE "documento_status" SET "chave" = 'obsoleto',            "ordem" = 8, "cor" = COALESCE("cor", 'neutro')     WHERE "nome" = 'Obsoleto'               AND "chave" IS NULL;
UPDATE "documento_status" SET "chave" = 'arquivado',           "ordem" = 9, "cor" = COALESCE("cor", 'neutro')     WHERE "nome" = 'Arquivado'              AND "chave" IS NULL;
