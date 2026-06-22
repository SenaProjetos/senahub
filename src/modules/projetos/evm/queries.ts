import "server-only";
import { prisma } from "@/lib/prisma";
import { differenceInCalendarDays } from "date-fns";

/**
 * N-25: EVM básico (Earned Value Management) baseado na EAP do projeto.
 *
 * - BAC  = valorContrato do projeto (orçamento total planejado)
 * - PV   = BAC × progresso esperado pelo cronograma hoje (folhas pesadas por duração)
 * - EV   = BAC × progresso real reportado (progresso % × peso da folha)
 * - AC   = despesas confirmadas lançadas no projeto (Lancamento receita excluída)
 * - SPI  = EV / PV   (> 1 adiantado, < 1 atrasado)
 * - CPI  = EV / AC   (> 1 abaixo do orçamento, < 1 acima)
 *
 * Retorna null se não há valorContrato ou EAP.
 */
export async function evmProjeto(projetoId: string) {
  const [projeto, tarefas, despesas] = await Promise.all([
    prisma.projeto.findUnique({
      where: { id: projetoId },
      select: { valorContrato: true },
    }),
    // Folhas da EAP (sem filhas) — evita dupla contagem de pacotes pai.
    prisma.eapTarefa.findMany({
      where: { projetoId, filhas: { none: {} } },
      select: { inicioPrevisto: true, fimPrevisto: true, progresso: true },
    }),
    prisma.lancamento.aggregate({
      where: { projetoId, tipo: "despesa", status: "confirmado" },
      _sum: { valorEfetivo: true, valor: true },
    }),
  ]);

  const bac = projeto?.valorContrato ? Number(projeto.valorContrato) : null;
  if (!bac || bac <= 0 || tarefas.length === 0) return null;

  const hoje = new Date();

  let totalPeso = 0;
  let pvSum = 0;
  let evSum = 0;

  for (const t of tarefas) {
    const ini = new Date(t.inicioPrevisto);
    const fim = new Date(t.fimPrevisto);
    // Peso proporcional à duração planejada em dias (mínimo 1 dia).
    const duracao = Math.max(1, differenceInCalendarDays(fim, ini) + 1);
    totalPeso += duracao;

    // PV: proporção do trabalho que deveria estar concluída até hoje.
    let pvFrac: number;
    if (hoje < ini) {
      pvFrac = 0;
    } else if (hoje >= fim) {
      pvFrac = 1;
    } else {
      pvFrac = differenceInCalendarDays(hoje, ini) / (duracao - 1 || 1);
    }
    pvSum += pvFrac * duracao;

    // EV: progresso real reportado.
    evSum += (t.progresso / 100) * duracao;
  }

  if (totalPeso === 0) return null;

  const pv = bac * (pvSum / totalPeso);
  const ev = bac * (evSum / totalPeso);
  const ac = Number(
    (despesas._sum.valorEfetivo ?? despesas._sum.valor) ?? 0,
  );

  const spi = pv > 0 ? ev / pv : null;
  const cpi = ac > 0 ? ev / ac : null;

  // Estimativa no término (EAC): AC + (BAC − EV) / CPI.
  const eac = cpi && cpi > 0 ? ac + (bac - ev) / cpi : null;

  return { bac, pv, ev, ac, spi, cpi, eac };
}

export type EvmData = NonNullable<Awaited<ReturnType<typeof evmProjeto>>>;
