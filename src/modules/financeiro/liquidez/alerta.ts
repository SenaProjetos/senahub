/**
 * O que o alerta de rompimento mostra (spec §6 e pedido do dono: informar, nunca decidir). Puro.
 *
 * Até a data do primeiro rompimento (negativo, senão reserva): as maiores saídas, as entradas por
 * confiança e — no motor — o total P3/P4 que dá para reprogramar. Transferência não entra em
 * nenhum desses números.
 */
import type { Projecao } from "@/modules/financeiro/liquidez/motor";
import type { Centavos, Confianca, DataIso, EventoCaixa } from "@/modules/financeiro/liquidez/tipos";

export type ResumoDoAlerta = {
  tipo: "deficit" | "reserva";
  /** Primeiro dia do rompimento. */
  data: DataIso;
  /** Pior falta até ali (déficit: saldo negativo; reserva: quanto fica abaixo dela). */
  falta: Centavos;
  maioresSaidas: { id: string; descricao: string; valor: Centavos }[];
  entradasPorConfianca: Record<Confianca, Centavos>;
  reprogramavelP3P4: Centavos;
};

/** `null` quando a projeção não rompe nada. */
export function resumoDoAlerta(projecao: Projecao, eventos: readonly EventoCaixa[], reservaMinima: Centavos, limiteSaidas = 3): ResumoDoAlerta | null {
  const tipo = projecao.primeiroDiaNegativo ? "deficit" : projecao.primeiroDiaAbaixoDaReserva ? "reserva" : null;
  if (!tipo) return null;
  const data = (projecao.primeiroDiaNegativo ?? projecao.primeiroDiaAbaixoDaReserva)!;

  const porId = new Map(projecao.eventos.map((p) => [p.id, p]));
  const ate = eventos.filter((e) => {
    const p = porId.get(e.id);
    return p?.aplicado && p.dia != null && p.dia <= data && e.natureza !== "transferencia";
  });

  const maioresSaidas = ate
    .filter((e) => e.tipo === "despesa")
    .sort((a, b) => b.valor - a.valor || (a.id < b.id ? -1 : 1))
    .slice(0, limiteSaidas)
    .map((e) => ({ id: e.id, descricao: e.descricao, valor: e.valor }));

  const entradasPorConfianca: Record<Confianca, Centavos> = { confirmada_cliente: 0, provavel: 0, estimada: 0, incerta: 0 };
  for (const e of ate) if (e.tipo === "receita" && e.confianca) entradasPorConfianca[e.confianca] += e.valor;

  const falta = tipo === "deficit" ? -projecao.menorSaldo.valor : Math.max(0, reservaMinima - projecao.menorSaldo.valor);
  return { tipo, data, falta, maioresSaidas, entradasPorConfianca, reprogramavelP3P4: projecao.reprogramavelP3P4 };
}
