-- Aviso ganha alvo por Setor, Contratação e Perfil de acesso — os eixos da reforma.
-- R6 do plano docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md.
--
-- Decisão do dono (2026-08-20): os TRÊS eixos ficam selecionáveis, em vez de eleger um.
-- Motivo: "todo mundo da Engenharia" é setor, "todos os CLT" é contratação e "quem vê
-- financeiro" é perfil — o aviso histórico usou 6 papéis misturados justamente porque um
-- eixo só não expressa o que as pessoas querem mirar.
--
-- `alvoTipo` continua sendo o discriminador (um aviso mira UM eixo). Isso evita ter de
-- inventar precedência entre três listas — "Engenharia E CLT" e "Engenharia OU CLT" são
-- audiências diferentes, e nenhum formato de array deixa isso óbvio.
--
-- NADA de UPDATE aqui de propósito: `ALTER TYPE ... ADD VALUE` não pode ser usado na mesma
-- transação que o adiciona (erro "unsafe use of new value of enum type"). O único aviso
-- histórico segue `categoria`, que continua funcionando.

ALTER TYPE "AvisoAlvoTipo" ADD VALUE IF NOT EXISTS 'setor';
ALTER TYPE "AvisoAlvoTipo" ADD VALUE IF NOT EXISTS 'contratacao';
ALTER TYPE "AvisoAlvoTipo" ADD VALUE IF NOT EXISTS 'perfil';

-- Sem DEFAULT: lista escalar do Prisma nasce como array vazio sem precisar de default no
-- banco, e é assim que o `alvoRoles` ao lado já está. Com DEFAULT o schema fica em drift.
ALTER TABLE "aviso"
  ADD COLUMN "alvoSetores"      "Setor"[],
  ADD COLUMN "alvoContratacoes" "Contratacao"[],
  ADD COLUMN "alvoPerfis"       TEXT[];
