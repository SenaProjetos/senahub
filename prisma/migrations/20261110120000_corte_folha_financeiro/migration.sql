-- Corte da folha no Financeiro (lançamento retroativo, spec 2026-11-10 §7.3).
-- As folhas de competência anterior a 10/2026 foram lançadas no Financeiro pelo extrato do banco;
-- `fecharFolhaNoBanco` recusa fechá-las (criaria as contas em dobro). Só dados: nenhuma mudança de schema.
-- ON CONFLICT DO NOTHING: quem já mudou o corte à mão não perde o valor.
INSERT INTO "config_sistema" ("chave", "valor", "updatedAt")
VALUES ('rh.folha.fechaNoFinanceiroDesde', '"2026-10"', now())
ON CONFLICT ("chave") DO NOTHING;
