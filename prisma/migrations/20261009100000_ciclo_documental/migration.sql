-- Ciclo de vida da revisão (ISO 19650): estado por revisão, versões internas, controles e configuração
-- por projeto. Só ADICIONA — nenhuma coluna/tabela removida. O estado dos dados que já existem NÃO é
-- decidido aqui: todas as revisões nascem `em_andamento` pelo default e o mapeamento real é feito por
-- `scripts/migrar-ciclo-documental.ts` (modo leitura por padrão; `--gravar` grava), logo após o deploy.

-- CreateEnum
CREATE TYPE "EstadoRevisao" AS ENUM ('em_andamento', 'compartilhado', 'publicado', 'arquivado');

-- CreateEnum
CREATE TYPE "TipoControleRevisao" AS ENUM ('liberado_obra', 'enviado_cliente', 'bloqueio', 'restricao');

-- CreateEnum
CREATE TYPE "EscopoBloqueio" AS ENUM ('download', 'atualizacao', 'exclusao');

-- AlterTable
ALTER TABLE "documento_evento" ADD COLUMN "revisaoId" TEXT;

-- AlterTable
ALTER TABLE "documento_revisao" ADD COLUMN "descricao" TEXT,
ADD COLUMN "estado" "EstadoRevisao" NOT NULL DEFAULT 'em_andamento',
ADD COLUMN "estadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "ultimaVersao" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "upload" ADD COLUMN "substituidoEm" TIMESTAMP(3),
ADD COLUMN "substituidoPorId" TEXT,
ADD COLUMN "versaoNaRevisao" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "controle_revisao" (
    "id" TEXT NOT NULL,
    "revisaoId" TEXT NOT NULL,
    "tipo" "TipoControleRevisao" NOT NULL,
    "escopos" "EscopoBloqueio"[],
    "motivo" TEXT NOT NULL,
    "automatico" BOOLEAN NOT NULL DEFAULT false,
    "origem" TEXT,
    "aplicadoPorId" TEXT,
    "aplicadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removidoPorId" TEXT,
    "removidoEm" TIMESTAMP(3),
    "motivoRemocao" TEXT,

    CONSTRAINT "controle_revisao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_documentos_projeto" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "liberarObraAutomaticamente" BOOLEAN NOT NULL DEFAULT false,
    "permitirPublicarComPendencias" BOOLEAN NOT NULL DEFAULT false,
    "diasAlertaCompartilhado" INTEGER NOT NULL DEFAULT 7,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "config_documentos_projeto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "controle_revisao_revisaoId_removidoEm_idx" ON "controle_revisao"("revisaoId", "removidoEm");

-- CreateIndex
CREATE INDEX "controle_revisao_tipo_removidoEm_idx" ON "controle_revisao"("tipo", "removidoEm");

-- CreateIndex
CREATE UNIQUE INDEX "config_documentos_projeto_projetoId_key" ON "config_documentos_projeto"("projetoId");

-- CreateIndex
CREATE INDEX "documento_evento_revisaoId_idx" ON "documento_evento"("revisaoId");

-- CreateIndex
CREATE INDEX "documento_revisao_estado_estadoEm_idx" ON "documento_revisao"("estado", "estadoEm");

-- CreateIndex
CREATE INDEX "upload_substituidoPorId_idx" ON "upload"("substituidoPorId");

-- AddForeignKey
ALTER TABLE "controle_revisao" ADD CONSTRAINT "controle_revisao_revisaoId_fkey" FOREIGN KEY ("revisaoId") REFERENCES "documento_revisao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_documentos_projeto" ADD CONSTRAINT "config_documentos_projeto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- I4 no banco: no máximo UMA revisão publicada por documento. Seguro aqui porque nenhuma linha nasce
-- `publicado` (o default é `em_andamento`); o script de mapeamento respeita a regra ao gravar.
CREATE UNIQUE INDEX "documento_revisao_um_publicado" ON "documento_revisao"("documentoId") WHERE "estado" = 'publicado';

-- Um controle ativo de cada tipo "de pasta" por revisão. Bloqueio e restrição podem coexistir em vários.
CREATE UNIQUE INDEX "controle_revisao_um_ativo" ON "controle_revisao"("revisaoId", "tipo")
  WHERE "removidoEm" IS NULL AND "tipo" IN ('liberado_obra', 'enviado_cliente');

-- Permissões novas (D7): publicar e bloquear/restringir nascem com quem já alterava o status documental,
-- perfil a perfil — derivado do par equivalente, para preservar a customização da tela de Permissões.
INSERT INTO "permissao_perfil" ("id", "perfilId", "recurso", "acao", "permitido")
SELECT gen_random_uuid()::text, pp."perfilId", 'arquivos', nova.acao, true
FROM "permissao_perfil" pp
CROSS JOIN (VALUES ('publicar'), ('bloquear')) AS nova(acao)
WHERE pp."recurso" = 'arquivos' AND pp."acao" = 'alterar_status' AND pp."permitido" = true
ON CONFLICT ("perfilId", "recurso", "acao") DO NOTHING;
-- `arquivos:somente_liberado_obra` (D6) é uma RESTRIÇÃO: não nasce em perfil nenhum.
