-- Decisão #17 (2026-09-25): histórico do % concluído por linha da EAP, para o Valor Agregado usar o
-- percentual que valia NA DATA DE STATUS em vez do de hoje. Aditiva: tabela e enum novos, nenhum dado
-- existente muda.
--
-- Sem backfill de propósito: `anterior` guarda o valor de antes de cada mudança, então a leitura de uma
-- data anterior ao primeiro registro já tem resposta certa (o `anterior` do registro mais antigo).
-- Enquanto a linha não tiver registro nenhum, vale o % atual dela — o comportamento de hoje.

-- CreateEnum
CREATE TYPE "OrigemProgressoEap" AS ENUM ('informado', 'execucao');

-- CreateTable
CREATE TABLE "eap_progresso_registro" (
    "id" TEXT NOT NULL,
    "tarefaId" TEXT NOT NULL,
    "progresso" INTEGER NOT NULL,
    "anterior" INTEGER NOT NULL,
    "em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataStatusVigente" DATE,
    "origem" "OrigemProgressoEap" NOT NULL DEFAULT 'informado',
    "autorId" TEXT,

    CONSTRAINT "eap_progresso_registro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "eap_progresso_registro_tarefaId_em_idx" ON "eap_progresso_registro"("tarefaId", "em");

-- AddForeignKey
ALTER TABLE "eap_progresso_registro" ADD CONSTRAINT "eap_progresso_registro_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "eap_tarefa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eap_progresso_registro" ADD CONSTRAINT "eap_progresso_registro_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- O % vai de 0 a 100 nas duas colunas; fora disso é dado inventado.
ALTER TABLE "eap_progresso_registro" ADD CONSTRAINT "eap_progresso_registro_faixa" CHECK ("progresso" BETWEEN 0 AND 100 AND "anterior" BETWEEN 0 AND 100);
