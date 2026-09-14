import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { sincronizarLancamentosArt } from "@/modules/financeiro/custo/lancamento-custo";

/**
 * Espelha a taxa da ART no Financeiro e grava os vínculos de volta na ART. Lê a ART já
 * atualizada dentro da transação — é o estado gravado que decide os lançamentos.
 */
export async function sincronizarFinanceiroArt(tx: Prisma.TransactionClient, artId: string, autorId: string) {
  const art = await tx.art.findUniqueOrThrow({
    where: { id: artId },
    include: {
      disciplina: { select: { disciplinaTextoLegado: true } },
      projeto: { select: { codigo: true, clienteId: true } },
    },
  });
  const ids = await sincronizarLancamentosArt(tx, {
    ...art,
    disciplinaNome: art.disciplina?.disciplinaTextoLegado ?? null,
    projetoCodigo: art.projeto.codigo,
    clienteId: art.projeto.clienteId,
    autorId,
  });
  if (ids.lancamentoId !== art.lancamentoId || ids.reembolsoLancamentoId !== art.reembolsoLancamentoId) {
    await tx.art.update({ where: { id: artId }, data: ids });
  }
}
