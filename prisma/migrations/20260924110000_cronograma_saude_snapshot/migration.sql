-- Foto semanal da Saúde do Cronograma (F2.5 / D42).
--
-- Entra JUNTO com o indicador, e não depois, porque este histórico é irrecuperável: ligar
-- a série seis meses adiante significa começar do zero, com meio ano de evolução perdido.
-- Guardar a foto é barato; reconstruir o passado é impossível.
--
-- `notaProvisoria` separa as fotos tiradas antes de a metodologia ser oficializada. Sem
-- essa marca, um gráfico futuro misturaria notas de pesos diferentes como se fossem a
-- mesma medida — mesmo papel do `keyVersion` no cofre de credenciais.
--
-- Aditiva: nenhuma tabela existente é tocada.

CREATE TABLE "cronograma_saude_snapshot" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "dia" DATE NOT NULL,
    "nota" INTEGER NOT NULL,
    "faixa" TEXT NOT NULL,
    "erros" INTEGER NOT NULL DEFAULT 0,
    "alertas" INTEGER NOT NULL DEFAULT 0,
    "principalCausa" TEXT,
    "notaProvisoria" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cronograma_saude_snapshot_pkey" PRIMARY KEY ("id")
);

-- Idempotência do job: rodar duas vezes no mesmo dia não cria foto duplicada.
CREATE UNIQUE INDEX "cronograma_saude_snapshot_projetoId_dia_key"
    ON "cronograma_saude_snapshot"("projetoId", "dia");

CREATE INDEX "cronograma_saude_snapshot_projetoId_dia_idx"
    ON "cronograma_saude_snapshot"("projetoId", "dia");

ALTER TABLE "cronograma_saude_snapshot"
  ADD CONSTRAINT "cronograma_saude_snapshot_projetoId_fkey"
  FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
