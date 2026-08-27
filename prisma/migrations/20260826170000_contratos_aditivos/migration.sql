-- Gerenciador de contratos (spec `docs/superpowers/specs/2026-08-26-gerenciador-contratos.md`),
-- Fase B2 — aditivos.
--
-- Aditiva pura: duas colunas nullable em `documento_juridico` e uma tabela nova. Nenhum documento
-- existente muda de comportamento.
--
-- `contratoOrigemId` é AUTO-RELAÇÃO: o aditivo é um `DocumentoJuridico` próprio — assinado à
-- parte, com versões e trilha próprias — que COEXISTE com o contrato que ele altera. Não é uma
-- nova versão dele (versão substitui a redação; aditivo altera um contrato que segue valendo).
-- `ON DELETE SET NULL`: apagar o contrato original não pode apagar o aditivo, que é prova de uma
-- alteração que de fato aconteceu.
--
-- `aditivo_equipe` fica em tabela separada porque `documento_juridico` também guarda procuração,
-- proposta e contrato de cliente — nenhum deles tem cargo nem remuneração. `ON DELETE CASCADE`
-- aqui sim: o delta só faz sentido enquanto existir o aditivo que o carrega.
--
-- `cargoId` é FK do catálogo, não texto livre, porque `resolverClassificacao`
-- (`modules/rh/catalogos/service.ts`) valida a existência e recusa cargo arquivado.
--
-- `assinadoEm` ordena os aditivos em `vencimentoEfetivo()`: entre duas prorrogações vale a
-- acordada por último, que não é necessariamente a de data mais distante.

-- AlterTable
ALTER TABLE "documento_juridico" ADD COLUMN     "assinadoEm" TIMESTAMP(3),
ADD COLUMN     "contratoOrigemId" TEXT;

-- CreateTable
CREATE TABLE "aditivo_equipe" (
    "id" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "vigenciaEm" DATE NOT NULL,
    "cargoId" TEXT,
    "remuneracao" DECIMAL(12,2),
    "cargaSemanal" DECIMAL(4,1),
    "novoVencimento" DATE,
    "motivo" TEXT,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aditivo_equipe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documento_juridico_contratoOrigemId_idx" ON "documento_juridico"("contratoOrigemId");

-- CreateIndex
CREATE UNIQUE INDEX "aditivo_equipe_documentoId_key" ON "aditivo_equipe"("documentoId");

-- CreateIndex
CREATE INDEX "aditivo_equipe_cargoId_idx" ON "aditivo_equipe"("cargoId");

-- AddForeignKey
ALTER TABLE "documento_juridico" ADD CONSTRAINT "documento_juridico_contratoOrigemId_fkey" FOREIGN KEY ("contratoOrigemId") REFERENCES "documento_juridico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aditivo_equipe" ADD CONSTRAINT "aditivo_equipe_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "documento_juridico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aditivo_equipe" ADD CONSTRAINT "aditivo_equipe_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "cargo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
