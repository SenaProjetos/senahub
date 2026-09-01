-- PALIATIVO DE INCIDENTE — só use se o deploy da E6 Parte B não puder sair agora.
--
-- Contexto: a tabela foi dropada em produção ANTES do código que parou de consultá-la ser
-- promovido para master. Enquanto produção rodar o código antigo, `/juridico` consulta
-- `modelo_contrato` e devolve 500. Recriar a tabela vazia devolve a página ao ar.
--
-- É seguro em relação à migration da E6: `20260830120000_e6_remove_modelo_contrato` usa
-- `DROP TABLE IF EXISTS`, então o `migrate deploy` do release a remove de novo, limpo.
--
-- A tabela é isolada (sem FK em nenhuma direção) e nasce vazia — a aba "Modelos" volta a
-- aparecer sem nenhum registro, que é o estado em que já estava.
--
-- Uso: psql $DATABASE_URL -f scripts/e6-restaurar-tabela-vazia.sql

CREATE TABLE IF NOT EXISTS "modelo_contrato" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" TEXT,
    "conteudo" TEXT NOT NULL DEFAULT '',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modelo_contrato_pkey" PRIMARY KEY ("id")
);
