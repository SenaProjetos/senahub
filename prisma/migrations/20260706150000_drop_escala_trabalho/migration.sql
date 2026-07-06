-- F7: Drop EscalaTrabalho (replaced by EscalaRole + EscalaUsuario in Ponto v2)
--
-- Backfill ANTES do DROP (à prova de ordem sob `prisma migrate deploy`, que aplica
-- F1→F7 numa tacada só): copia o total de horas/dia legado para EscalaUsuario
-- seg–sex (dias 1..5), sem horários fixos — preserva o comportamento atual (só
-- total de horas/dia) até o usuário configurar uma grade em /rh/escalas.
-- `id` não tem default no banco (Prisma gera cuid no app) → gerado aqui via
-- gen_random_uuid() (core no PostgreSQL 13+). ON CONFLICT protege reexecução e
-- linhas já criadas por scripts/migrar-escalas.ts em ambientes já migrados.
INSERT INTO "escala_usuario" ("id", "userId", "diaSemana", "horasDia", "ativo")
SELECT gen_random_uuid()::text, et."userId", d.dia, et."horasDia", et."ativo"
FROM "escala_trabalho" et
CROSS JOIN (VALUES (1), (2), (3), (4), (5)) AS d(dia)
ON CONFLICT ("userId", "diaSemana") DO NOTHING;

-- Nome real da tabela é snake_case ("escala_trabalho"), conforme a migration de criação
-- (20260612020303_onda3b_ponto). Identificador entre aspas é case-sensitive no Postgres,
-- então "EscalaTrabalho" NÃO dropava a tabela.
DROP TABLE IF EXISTS "escala_trabalho" CASCADE;
