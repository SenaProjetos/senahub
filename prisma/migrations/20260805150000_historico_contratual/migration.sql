-- Histórico contratual datado (sub-etapa 2.3).
--
-- Tabela-filha do vínculo, e não uma nova linha de `Vinculo`: o ponto usa `Vinculo.dataInicio`
-- como piso de apuração, então fechar o vínculo a cada reajuste jogaria os dias anteriores à
-- data do aumento para fora da janela apurável.
--
-- Inclui a CARGA INICIAL: uma linha por pessoa que já tem cargo, departamento ou salário.
-- Vigência = data em que esta migration rodar. A regra original (data de admissão) foi
-- descartada ao conferir produção: `dataAdmissao` está nulo em todos os usuários e não há
-- nenhuma data passada confiável. O histórico passa a valer daqui em diante.

-- CreateTable
CREATE TABLE "historico_contratual" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vinculoId" TEXT,
    "vigenciaEm" DATE NOT NULL,
    "cargoId" TEXT,
    "departamentoId" TEXT,
    "cargoNome" TEXT,
    "departamentoNome" TEXT,
    "remuneracao" DECIMAL(12,2),
    "motivo" TEXT,
    "observacao" TEXT,
    "autorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historico_contratual_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "historico_contratual_userId_vigenciaEm_idx" ON "historico_contratual"("userId", "vigenciaEm");

-- CreateIndex
CREATE INDEX "historico_contratual_vinculoId_idx" ON "historico_contratual"("vinculoId");

-- CreateIndex
CREATE INDEX "historico_contratual_cargoId_idx" ON "historico_contratual"("cargoId");

-- CreateIndex
CREATE INDEX "historico_contratual_departamentoId_idx" ON "historico_contratual"("departamentoId");

-- CreateIndex
CREATE INDEX "historico_contratual_autorId_idx" ON "historico_contratual"("autorId");

-- AddForeignKey
ALTER TABLE "historico_contratual" ADD CONSTRAINT "historico_contratual_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_contratual" ADD CONSTRAINT "historico_contratual_vinculoId_fkey" FOREIGN KEY ("vinculoId") REFERENCES "vinculo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_contratual" ADD CONSTRAINT "historico_contratual_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "cargo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_contratual" ADD CONSTRAINT "historico_contratual_departamentoId_fkey" FOREIGN KEY ("departamentoId") REFERENCES "departamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_contratual" ADD CONSTRAINT "historico_contratual_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- CARGA INICIAL
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  admin_id text;
  criadas  integer;
BEGIN
  -- Autor da carga: o admin ativo mais antigo. Sem admin (base recém-criada) não há o que
  -- migrar — sai em silêncio em vez de falhar o deploy.
  SELECT id INTO admin_id
  FROM "user"
  WHERE role = 'admin' AND ativo = true
  ORDER BY "createdAt" ASC
  LIMIT 1;

  IF admin_id IS NULL THEN
    RAISE NOTICE 'Sem admin ativo: carga inicial do historico contratual ignorada.';
    RETURN;
  END IF;

  INSERT INTO "historico_contratual"
    ("id", "userId", "vinculoId", "vigenciaEm", "cargoId", "departamentoId",
     "cargoNome", "departamentoNome", "remuneracao", "motivo", "observacao", "autorId", "criadoEm")
  SELECT
    gen_random_uuid()::text,
    u."id",
    u."vinculoAtivoId",
    CURRENT_DATE,
    u."cargoId",
    u."departamentoId",
    u."cargo",
    u."departamento",
    u."salarioBase",
    'carga_inicial',
    'Estado do cadastro no momento da migracao. Reajustes anteriores nao foram reconstruidos: nao havia data registrada.',
    admin_id,
    CURRENT_TIMESTAMP
  FROM "user" u
  WHERE u."cargoId" IS NOT NULL
     OR u."departamentoId" IS NOT NULL
     OR u."salarioBase" IS NOT NULL;

  GET DIAGNOSTICS criadas = ROW_COUNT;
  RAISE NOTICE 'Carga inicial do historico contratual: % linha(s).', criadas;
END $$;
