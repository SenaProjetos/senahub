-- Onda F (poda final): o papel legado sai do banco.
-- Seus quatro eixos já vivem em colunas próprias: User.tipo (interno/externo, NOT NULL desde
-- 20261010160000), User.setor, User.contratacao (vínculo ativo), User.perfilId + superUsuario
-- (acesso). Nenhuma tabela mais usa o tipo "Role": permissao saiu em 20261010150000,
-- escala_role em 20260924120000 e SolicitacaoCadastro.role em 20260820 (R6).
-- IF EXISTS: reexecutável. DROP TYPE sem CASCADE de propósito — se algo ainda depender do tipo,
-- a migration falha em vez de apagar coluna alheia.
DROP INDEX IF EXISTS "user_role_idx";
ALTER TABLE "user" DROP COLUMN IF EXISTS "role";
DROP TYPE IF EXISTS "Role";
