-- Gerenciador de contratos (spec `docs/superpowers/specs/2026-08-26-gerenciador-contratos.md`),
-- Fases F (assinatura externa) e G (cronograma de faturamento).
--
-- Aditiva pura: duas tabelas novas e três colunas nullable. Nenhum registro existente muda.
--
-- ── Fase F ────────────────────────────────────────────────────────────────────────────────────
-- `link_publico_assinatura` segue a convenção dos outros links públicos do sistema
-- (`link_publico_arquivos`, `link_publico_certidoes`) e a regra única de `lib/link-publico.ts`:
-- `ativo = false` revoga na hora, `expiraEm` no passado desliga. UM link por signatário — o nome
-- fica gravado ANTES do envio, e é o que prova para quem o link foi mandado.
--
-- `aceite_externo_documento` é tabela PRÓPRIA, e não uma linha de `aceite_documento` com `userId`
-- nulo: lá a identidade vem da sessão autenticada, aqui vem da posse do link somada ao que a
-- pessoa declarou. Misturar apagaria a diferença de força probatória entre as duas.
-- A unique em `linkId` é o que garante USO ÚNICO no banco, não só na aplicação.
--
-- ── Fase G ────────────────────────────────────────────────────────────────────────────────────
-- `parcelas`/`primeiroVencimento` guardam o PLANO; as parcelas em si só nascem na assinatura.
-- `lancamento.contratoId` com `ON DELETE SET NULL`: apagar o contrato não pode apagar o
-- recebível — o dinheiro previsto continua existindo e some do fluxo de caixa se for junto.
--
-- ⚠️ `lancamento` tem soft delete (extension em `lib/prisma.ts` filtra `excluidoEm: null`). Esta
-- migration só ADICIONA coluna nullable, então não precisa considerar as linhas logicamente
-- excluídas — nenhuma leitura ou escrita de linha existente acontece aqui.

-- AlterTable
ALTER TABLE "documento_juridico" ADD COLUMN     "parcelas" INTEGER,
ADD COLUMN     "primeiroVencimento" DATE;

-- AlterTable
ALTER TABLE "lancamento" ADD COLUMN     "contratoId" TEXT;

-- CreateTable
CREATE TABLE "link_publico_assinatura" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "versaoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "expiraEm" TIMESTAMP(3),
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "link_publico_assinatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aceite_externo_documento" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "versaoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT,
    "hashArquivo" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "assinadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aceite_externo_documento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "link_publico_assinatura_token_key" ON "link_publico_assinatura"("token");

-- CreateIndex
CREATE INDEX "link_publico_assinatura_versaoId_idx" ON "link_publico_assinatura"("versaoId");

-- CreateIndex
CREATE UNIQUE INDEX "aceite_externo_documento_linkId_key" ON "aceite_externo_documento"("linkId");

-- CreateIndex
CREATE INDEX "aceite_externo_documento_versaoId_idx" ON "aceite_externo_documento"("versaoId");

-- CreateIndex
CREATE INDEX "lancamento_contratoId_idx" ON "lancamento"("contratoId");

-- AddForeignKey
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "documento_juridico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "link_publico_assinatura" ADD CONSTRAINT "link_publico_assinatura_versaoId_fkey" FOREIGN KEY ("versaoId") REFERENCES "doc_juridico_versao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aceite_externo_documento" ADD CONSTRAINT "aceite_externo_documento_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "link_publico_assinatura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aceite_externo_documento" ADD CONSTRAINT "aceite_externo_documento_versaoId_fkey" FOREIGN KEY ("versaoId") REFERENCES "doc_juridico_versao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
