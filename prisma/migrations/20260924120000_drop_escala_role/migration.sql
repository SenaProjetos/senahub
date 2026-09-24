-- Onda E, passo 4 (§6.4 do plano de Setor × Contratação × Perfil de acesso).
-- `escala_role` (grade padrão por PAPEL) deixou de ser lida por qualquer cálculo na v1.10.0,
-- quando a jornada passou a resolver por `escala_contratacao`; desde então só recebia a
-- escrita dupla da tela /rh/escalas, que agora grava direto na contratação.
-- IF EXISTS: DROP em produção sai junto com o deploy e precisa ser reexecutável.
DROP TABLE IF EXISTS "escala_role";
