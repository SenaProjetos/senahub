-- Diário da coordenação (2026-11-05): entrada sem disciplina = registro da coordenação, valendo para o
-- projeto inteiro. Só afrouxa a coluna; nenhuma linha muda.
-- Voltar (SET NOT NULL) exige antes apagar as entradas da coordenação (disciplinaId nulo).
ALTER TABLE "diario_entrada" ALTER COLUMN "disciplinaId" DROP NOT NULL;
