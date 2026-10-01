/**
 * Regras de uma caixinha (spec §4, plano I9). Puro: sem banco, sem Next — roda no navegador e no
 * servidor. Dinheiro em centavos inteiros, datas `YYYY-MM-DD`.
 *
 *   A = soma dos movimentos (com sinal)           alocado
 *   U = despesas realizadas ligadas à caixinha    usado (só de `dataConfirmacao ≥ criação`, ≤ t)
 *   R = max(0, A − U)                             reservado
 *   X = max(0, U − A)                             uso além do reservado (já saiu do livre; só avisa)
 */
import { somarDias } from "@/modules/financeiro/liquidez/datas";
import type { Centavos, DataIso } from "@/modules/financeiro/liquidez/tipos";

export type TipoMovimento = "alocacao" | "liberacao" | "transferencia" | "ajuste";
export type RegraNecessidade = "meta_fixa" | "compromissos_ligados";

export type MovimentoDaCaixinha = { tipo: TipoMovimento; valor: Centavos };
export type SaidaRealizada = { valor: Centavos; dataConfirmacao: DataIso | null };
export type SaidaPendente = { id: string; descricao: string; valor: Centavos; data: DataIso };

export function alocado(movimentos: readonly Pick<MovimentoDaCaixinha, "valor">[]): Centavos {
  return movimentos.reduce((s, m) => s + m.valor, 0);
}

/**
 * Uso real: só conta o que foi realizado DEPOIS de a caixinha existir (senão uma caixinha nova
 * "gastaria" o que foi pago antes dela) e até `ate` (hoje). Realizado sem data não conta.
 */
export function usado(
  saidas: readonly SaidaRealizada[],
  criadaEm: DataIso,
  ate: DataIso,
): Centavos {
  let u = 0;
  for (const s of saidas) {
    if (s.dataConfirmacao == null) continue;
    if (s.dataConfirmacao < criadaEm || s.dataConfirmacao > ate) continue;
    u += s.valor;
  }
  return u;
}

export function reservado(alocadoCent: Centavos, usadoCent: Centavos): { reservado: Centavos; usoAlem: Centavos } {
  return { reservado: Math.max(0, alocadoCent - usadoCent), usoAlem: Math.max(0, usadoCent - alocadoCent) };
}

export type SituacaoCaixinha = {
  alocado: Centavos;
  usado: Centavos;
  reservado: Centavos;
  /** Uso que passou do reservado: o livre já caiu por isso; a tela avisa. */
  usoAlem: Centavos;
  /** Necessidade em centavos; `null` = sem meta definida. */
  necessidade: Centavos | null;
  /** 0–100 inteiro; `null` sem necessidade. */
  percentual: number | null;
  /** Quanto falta para a necessidade; 0 quando completa; `null` sem necessidade. */
  falta: Centavos | null;
  estado: "sem_meta" | "completa" | "falta";
  proximoUso: SaidaPendente | null;
};

/**
 * Situação de uma caixinha. `pendentes` = saídas em aberto ligadas a ela (qualquer data): a
 * necessidade por compromissos considera só as que vencem dentro do horizonte; o próximo uso é a
 * mais próxima de todas (vencidas primeiro).
 */
export function situacaoDaCaixinha(p: {
  regra: RegraNecessidade;
  meta: Centavos | null;
  horizonteDias: number;
  hoje: DataIso;
  alocado: Centavos;
  usado: Centavos;
  pendentes: readonly SaidaPendente[];
}): SituacaoCaixinha {
  const { reservado: r, usoAlem } = reservado(p.alocado, p.usado);
  const ordenadas = [...p.pendentes].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.id < b.id ? -1 : 1));
  const fim = somarDias(p.hoje, Math.max(1, p.horizonteDias) - 1);

  let necessidade: Centavos | null;
  if (p.regra === "meta_fixa") necessidade = p.meta != null && p.meta > 0 ? p.meta : null;
  else necessidade = ordenadas.filter((s) => s.data <= fim).reduce((s, x) => s + x.valor, 0);
  // Por compromissos, "nada a pagar no horizonte" é necessidade ZERO (completa), não "sem meta".

  const percentual = necessidade == null ? null : necessidade === 0 ? 100 : Math.min(100, Math.round((r / necessidade) * 100));
  const falta = necessidade == null ? null : Math.max(0, necessidade - r);
  return {
    alocado: p.alocado,
    usado: p.usado,
    reservado: r,
    usoAlem,
    necessidade,
    percentual,
    falta,
    estado: necessidade == null ? "sem_meta" : (falta ?? 0) === 0 ? "completa" : "falta",
    proximoUso: ordenadas[0] ?? null,
  };
}

// ── Movimentos manuais (I9) ───────────────────────────────────────────────────

export type PedidoMovimento =
  | { tipo: "alocacao"; valor: Centavos }
  | { tipo: "liberacao"; valor: Centavos }
  | { tipo: "ajuste"; valor: Centavos }
  | { tipo: "transferencia"; valor: Centavos };

export const MOTIVO_VALOR_ZERO = "Informe um valor maior que zero.";

/**
 * Valida um movimento contra a situação ATUAL da caixinha (origem, no caso de transferência).
 * Reservar nunca é recusado por falta de caixa: o planejador informa a reserva descoberta, não
 * impede. Liberar e transferir só o que está reservado; o ajuste (com sinal) não pode deixar o
 * alocado negativo. Devolve a mensagem de recusa ou `null`.
 */
export function motivoDeRecusa(p: PedidoMovimento, atual: { alocado: Centavos; reservado: Centavos }): string | null {
  if (!Number.isInteger(p.valor) || p.valor === 0) return MOTIVO_VALOR_ZERO;
  if (p.tipo === "ajuste") {
    return atual.alocado + p.valor < 0 ? "O ajuste deixaria o valor alocado negativo." : null;
  }
  if (p.valor < 0) return MOTIVO_VALOR_ZERO;
  if ((p.tipo === "liberacao" || p.tipo === "transferencia") && p.valor > atual.reservado) {
    return `Só dá para ${p.tipo === "liberacao" ? "liberar" : "transferir"} o que está reservado agora.`;
  }
  return null;
}

/** Linhas gravadas para um pedido (sinal aplicado). Transferência = saída na origem + entrada no destino. */
export function linhasDoMovimento(
  p: PedidoMovimento,
  origemId: string,
  destinoId?: string,
): { caixinhaId: string; tipo: TipoMovimento; valor: Centavos }[] {
  if (p.tipo === "alocacao") return [{ caixinhaId: origemId, tipo: "alocacao", valor: p.valor }];
  if (p.tipo === "liberacao") return [{ caixinhaId: origemId, tipo: "liberacao", valor: -p.valor }];
  if (p.tipo === "ajuste") return [{ caixinhaId: origemId, tipo: "ajuste", valor: p.valor }];
  if (!destinoId || destinoId === origemId) throw new Error("Transferência precisa de outra caixinha de destino.");
  return [
    { caixinhaId: origemId, tipo: "transferencia", valor: -p.valor },
    { caixinhaId: destinoId, tipo: "transferencia", valor: p.valor },
  ];
}

/** Resumo do conjunto: o "Caixa = Reservado + Livre" da tela (com a falta aparecendo como descoberta). */
export function resumoGeral(caixa: Centavos, reservados: readonly Centavos[]) {
  const r = reservados.reduce((s, x) => s + x, 0);
  const livreBruto = caixa - r;
  return { caixa, reservado: r, livre: Math.max(0, livreBruto), descoberto: Math.max(0, -livreBruto) };
}
