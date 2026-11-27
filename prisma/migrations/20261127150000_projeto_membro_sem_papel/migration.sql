-- O papel do membro do projeto sai (decisão do dono, 2026-11-27): a coordenação do projeto passa a ser
-- quem tem o perfil de acesso Coordenador e enxerga o projeto (src/modules/projetos/coordenacao.ts).
-- Ninguém mais lê esta coluna; o valor antigo não é migrado para lugar nenhum.
ALTER TABLE "projeto_membro" DROP COLUMN "papel";
