import "server-only";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import type { Prisma } from "@/generated/prisma/client";
import { recalcularCaminho, exigirOrcamentoEditavel } from "../orcamento/service";

type CamposQuantitativo = {
  descricao: string;
  grandeza: "area" | "volume" | "comprimento" | "contagem" | "peso";
  unidade: string;
  quantidade: number;
  origem: "manual" | "ifc" | "dwg" | "pdf" | "ia";
  confianca?: number | null;
  uploadId?: string | null;
  guids?: string[] | null;
  pagina?: number | null;
  ancoraJson?: unknown;
  memoria?: string | null;
};

function dadosCriacao(orcamentoId: string, input: CamposQuantitativo, criadoPorId: string) {
  return {
    orcamentoId,
    descricao: input.descricao,
    grandeza: input.grandeza,
    unidade: input.unidade,
    quantidade: input.quantidade,
    origem: input.origem,
    confianca: input.confianca ?? null,
    uploadId: input.uploadId ?? null,
    guids: (input.guids ?? undefined) as Prisma.InputJsonValue | undefined,
    pagina: input.pagina ?? null,
    ancoraJson: input.ancoraJson === undefined ? undefined : (input.ancoraJson as Prisma.InputJsonValue),
    memoria: input.memoria ?? null,
    criadoPorId,
  };
}

/** Registra um levantamento "solto" (ainda sem item de orçamento) — sempre uma linha NOVA. */
export async function registrarQuantitativo(
  orcamentoId: string,
  input: CamposQuantitativo,
  criadoPorId: string,
) {
  return prisma.custoQuantitativo.create({ data: dadosCriacao(orcamentoId, input, criadoPorId) });
}

/**
 * Recontagem: nunca sobrescreve (regra 10) — cria uma linha nova e aponta a antiga pra ela via
 * `substituidoPorId`. NÃO reaplica automaticamente a um item, mesmo que a antiga estivesse
 * aplicada — aplicar é sempre ação explícita (§3.5 do plano).
 */
export async function recontarQuantitativo(
  quantitativoAnteriorId: string,
  input: CamposQuantitativo,
  criadoPorId: string,
) {
  return prisma.$transaction(async (db) => {
    const anterior = await db.custoQuantitativo.findUnique({ where: { id: quantitativoAnteriorId } });
    if (!anterior) throw new ActionError("Levantamento anterior não encontrado.");
    if (anterior.substituidoPorId) {
      throw new ActionError("Este levantamento já foi recontado — abra a versão mais recente.");
    }

    const novo = await db.custoQuantitativo.create({
      data: dadosCriacao(anterior.orcamentoId, input, criadoPorId),
    });
    await db.custoQuantitativo.update({
      where: { id: anterior.id },
      data: { substituidoPorId: novo.id },
    });
    return novo;
  });
}

/**
 * Aplica um levantamento a um item do orçamento: grava a quantidade no item, materializa o
 * vínculo BIM (quando origem=ifc) e refaz o roll-up do caminho até a raiz — sem isso
 * `totalSemBdi`/`totalComBdi` divergem silenciosamente da quantidade nova (C2 nunca recalcula
 * na leitura). O "de→para" para confirmação na tela é responsabilidade do chamador (lê o item
 * ANTES de chamar esta função); o audit log captura o "antes" via `capturarAntes` na action.
 */
export async function aplicarQuantitativoAoItem(quantitativoId: string, itemId: string) {
  return prisma.$transaction(async (db) => {
    const quantitativo = await db.custoQuantitativo.findUnique({ where: { id: quantitativoId } });
    if (!quantitativo) throw new ActionError("Levantamento não encontrado.");
    if (quantitativo.substituidoPorId) {
      throw new ActionError("Este levantamento foi recontado — aplique a versão mais recente.");
    }

    const item = await db.custoOrcamentoItem.findUnique({
      where: { id: itemId },
      select: { id: true, orcamentoId: true, tipo: true },
    });
    if (!item) throw new ActionError("Item não encontrado.");
    if (item.orcamentoId !== quantitativo.orcamentoId) {
      throw new ActionError("O levantamento pertence a outro orçamento.");
    }
    if (item.tipo !== "servico") {
      throw new ActionError("Só é possível aplicar um levantamento a um serviço, não a um grupo.");
    }
    await exigirOrcamentoEditavel(db, item.orcamentoId);

    await db.custoQuantitativo.update({ where: { id: quantitativoId }, data: { itemId } });
    await db.custoOrcamentoItem.update({ where: { id: itemId }, data: { quantidade: quantitativo.quantidade } });

    if (quantitativo.origem === "ifc" && quantitativo.uploadId && Array.isArray(quantitativo.guids)) {
      const guids = quantitativo.guids.filter((g): g is string => typeof g === "string");
      if (guids.length > 0) {
        await db.custoVinculoBim.createMany({
          data: guids.map((ifcGuid) => ({ itemId, uploadId: quantitativo.uploadId!, ifcGuid })),
          skipDuplicates: true,
        });
      }
    }

    await recalcularCaminho(db, item.orcamentoId, itemId);
    return db.custoOrcamentoItem.findUniqueOrThrow({ where: { id: itemId } });
  });
}

export async function excluirVinculoBim(id: string) {
  const vinculo = await prisma.custoVinculoBim.findUnique({ where: { id }, select: { id: true, itemId: true } });
  if (!vinculo) throw new ActionError("Vínculo não encontrado.");
  await prisma.custoVinculoBim.delete({ where: { id } });
  return vinculo;
}
