import "server-only";

/**
 * Movimento de caixinha no banco — o mesmo código que a Server Action usa e que o
 * `smoke:planejador` exercita (a action exige sessão; o smoke não tem uma).
 *
 * A regra de aceitar ou recusar é pura (`calculo.ts`); aqui ficam o I/O e a parte que a regra pura
 * não pode garantir: a validação lê a situação ANTES da transação, então duas liberações simultâneas
 * passariam as duas e o alocado ficaria negativo — e `reservado = max(0, A − U)` esconderia isso. O
 * lock da linha da caixinha serializa os movimentos dela e a conta é refeita dentro da transação.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { diaDeSaoPaulo } from "@/lib/data";
import { linhasDoMovimento, motivoDeRecusa, type PedidoMovimento } from "@/modules/financeiro/caixinhas/calculo";
import { carregarCaixinhas } from "@/modules/financeiro/caixinhas/queries";
import { paraCentavos } from "@/modules/financeiro/liquidez/dinheiro";

export type PedidoNoBanco = PedidoMovimento & {
  caixinhaId: string;
  destinoId?: string;
  /** `YYYY-MM-DD`. */
  data: string;
  descricao?: string;
};

async function exigirAtiva(id: string, qual: "origem" | "destino") {
  const c = await prisma.caixinha.findUnique({ where: { id }, select: { ativo: true } });
  if (!c) throw new ActionError("Caixinha não encontrada.");
  if (!c.ativo) {
    throw new ActionError(qual === "origem" ? "Caixinha inativa: restaure antes de movimentar." : "A caixinha de destino está inativa.");
  }
}

export async function movimentarNoBanco(p: PedidoNoBanco, autorId: string): Promise<{ pernas: number }> {
  await exigirAtiva(p.caixinhaId, "origem");
  if (p.tipo === "transferencia") {
    if (!p.destinoId || p.destinoId === p.caixinhaId) throw new ActionError("Escolha outra caixinha de destino.");
    await exigirAtiva(p.destinoId, "destino");
  }

  const hoje = diaDeSaoPaulo();
  const atual = (await carregarCaixinhas({ hoje })).find((c) => c.id === p.caixinhaId)?.situacao;
  if (!atual) throw new ActionError("Caixinha não encontrada.");
  const recusa = motivoDeRecusa({ tipo: p.tipo, valor: p.valor } as PedidoMovimento, { alocado: atual.alocado, reservado: atual.reservado });
  if (recusa) throw new ActionError(recusa);

  const linhas = linhasDoMovimento({ tipo: p.tipo, valor: p.valor } as PedidoMovimento, p.caixinhaId, p.destinoId);
  const transferenciaId = p.tipo === "transferencia" ? randomUUID() : null;
  await prisma.$transaction(async (tx) => {
    // Ids em ordem para duas transferências cruzadas não travarem uma na outra.
    const ids = [...new Set(linhas.map((l) => l.caixinhaId))].sort();
    await tx.$queryRaw`SELECT id FROM caixinha WHERE id = ANY(${ids}::text[]) FOR UPDATE`;
    for (const l of linhas.filter((x) => x.valor < 0)) {
      const soma = await tx.movimentoCaixinha.aggregate({ where: { caixinhaId: l.caixinhaId }, _sum: { valor: true } });
      if (paraCentavos(soma._sum.valor ?? 0) + l.valor < 0) {
        throw new ActionError(
          p.tipo === "ajuste"
            ? "O ajuste deixaria o valor alocado negativo."
            : `Só dá para ${p.tipo === "liberacao" ? "liberar" : "transferir"} o que está reservado agora.`,
        );
      }
    }
    for (const l of linhas) {
      await tx.movimentoCaixinha.create({
        data: {
          caixinhaId: l.caixinhaId,
          tipo: l.tipo,
          valor: l.valor / 100,
          data: new Date(`${p.data}T00:00:00.000Z`),
          descricao: p.descricao || null,
          transferenciaId,
          autorId,
        },
      });
    }
  });
  return { pernas: linhas.length };
}
