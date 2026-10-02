import "server-only";
import { prisma } from "@/lib/prisma";

/** Chaves das categorias de retirada de lucro (criadas pela migração `categorias_distribuicao`). */
const CHAVES_LUCRO = ["distribuicao_lucros", "adiantamento_lucros"] as const;

/**
 * Quanto saiu para os sócios como distribuição ou adiantamento de lucros no período, já PAGO
 * (pela data de pagamento). Fica fora do resultado — a Visão geral mostra ao lado da DRE para a
 * conta "o resultado foi X e saíram Y para os sócios" fechar sem abrir outra tela.
 */
export async function distribuidoAosSocios(de: Date, ate: Date): Promise<number> {
  const rows = await prisma.lancamento.findMany({
    where: {
      status: "confirmado",
      excluidoEm: null,
      tipo: "despesa",
      dataConfirmacao: { gte: de, lte: ate },
      categoria: { chave: { in: [...CHAVES_LUCRO] } },
    },
    select: { valor: true, valorEfetivo: true },
  });
  return rows.reduce((s, l) => s + Number(l.valorEfetivo ?? l.valor), 0);
}
