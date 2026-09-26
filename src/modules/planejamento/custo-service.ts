import "server-only";
import { prisma } from "@/lib/prisma";
import type { PlanoDoProjeto } from "./agenda";
import { custoDaFolha, custosComResumo, custoTotal, type CustoLinha } from "./custo";

/**
 * Custo previsto das linhas de um projeto (F7.1): lê as taxas (`Recurso.custoHora`) de quem está
 * escalado e aplica as regras puras de `custo.ts`. Um lugar só para a EAP (tela) e para a linha
 * de base (congelamento) — se cada um calculasse o seu, o VP da F8 divergiria do que a tela
 * mostrou no dia do aprovar.
 *
 * As horas de cada folha vêm do MOTOR (`trabalhoHoras`), não de uma soma refeita aqui: é o motor
 * que decide o que é "não estimada" (nulo) e o que é zero conhecido (marco, etapa de terceiro).
 *
 * VALOR SENSÍVEL: é taxa de remuneração multiplicada. Quem chama decide se o viewer pode ver
 * (`podeVerFinanceiro`) — esta função não mascara nada.
 */
export async function custosDoProjeto(
  plano: PlanoDoProjeto | null,
  linhas: readonly {
    id: string;
    parentId: string | null;
    atribuicoes: readonly { userId: string | null; horasPrevistas: unknown }[];
  }[],
): Promise<{ porLinha: Map<string, CustoLinha>; total: CustoLinha }> {
  const userIds = [
    ...new Set(linhas.flatMap((l) => l.atribuicoes.map((a) => a.userId)).filter((u): u is string => u != null)),
  ];
  const recursos = userIds.length
    ? await prisma.recurso.findMany({
        where: { userId: { in: userIds }, custoHora: { not: null } },
        select: { userId: true, custoHora: true },
      })
    : [];
  const custoHora = new Map(recursos.map((r) => [r.userId, Number(r.custoHora)]));

  const folhas = new Map<string, CustoLinha>();
  for (const l of linhas) {
    const agendada = plano?.resultado.linhas.get(l.id);
    if (agendada?.ehResumo) continue;
    folhas.set(
      l.id,
      custoDaFolha({
        horasDaLinha: agendada ? agendada.trabalhoHoras : null,
        atribuicoes: l.atribuicoes.map((a) => ({ userId: a.userId, horas: Number(a.horasPrevistas) })),
        custoHora,
      }),
    );
  }
  const porLinha = custosComResumo(linhas, folhas);
  return { porLinha, total: custoTotal(linhas, porLinha) };
}
