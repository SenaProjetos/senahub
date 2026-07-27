-- Coordenação BIM: projetoId/disciplinaId do ApontamentoCoordenacao ganham FK real
-- (antes eram strings denormalizadas sem integridade referencial). O `uploadId`
-- (chave de modelo polimórfica `d:<versaoId>`/uploadId cru, âncora de snapshot que
-- precisa sobreviver à exclusão do modelo) permanece denormalizado de propósito.

-- Limpeza de refs órfãs antes de criar as constraints (dados denormalizados podem
-- ter apontado para linhas já removidas).
UPDATE "apontamento_coordenacao"
  SET "disciplinaId" = NULL
  WHERE "disciplinaId" IS NOT NULL
    AND "disciplinaId" NOT IN (SELECT "id" FROM "disciplina");

DELETE FROM "apontamento_coordenacao"
  WHERE "projetoId" NOT IN (SELECT "id" FROM "projeto");

-- AddForeignKey
ALTER TABLE "apontamento_coordenacao" ADD CONSTRAINT "apontamento_coordenacao_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apontamento_coordenacao" ADD CONSTRAINT "apontamento_coordenacao_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplina"("id") ON DELETE SET NULL ON UPDATE CASCADE;
