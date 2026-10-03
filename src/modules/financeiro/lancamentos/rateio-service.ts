import "server-only";

/** Rateio de um lançamento entre centros/projetos (M10): leitura e gravação. Regras puras em `rateio.ts`. */
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { validarRateio, type ItemRateio } from "@/modules/financeiro/lancamentos/rateio";

export async function lerRateio(lancamentoId: string): Promise<ItemRateio[]> {
  const linhas = await prisma.rateioLancamento.findMany({
    where: { lancamentoId },
    select: { centroId: true, projetoId: true, percentualBp: true },
  });
  return linhas;
}

/** Substitui todo o rateio do lançamento (delete+create numa transação). Lista vazia = remove o rateio. */
export async function salvarRateioNoBanco(lancamentoId: string, itens: readonly ItemRateio[]): Promise<void> {
  if (itens.length > 0) {
    const erro = validarRateio(itens);
    if (erro) throw new ActionError(erro);
  }
  await prisma.$transaction([
    prisma.rateioLancamento.deleteMany({ where: { lancamentoId } }),
    ...(itens.length > 0
      ? [
          prisma.rateioLancamento.createMany({
            data: itens.map((i) => ({ lancamentoId, centroId: i.centroId, projetoId: i.projetoId, percentualBp: i.percentualBp })),
          }),
        ]
      : []),
  ]);
}
