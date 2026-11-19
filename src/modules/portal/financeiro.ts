/**
 * Financeiro do portal do cliente: as parcelas que o cliente paga ao escritório, só valores e datas
 * (decisão do dono, 2026-11-19 — sem nota, boleto, conta ou descrição interna). Puro, sem I/O.
 *
 * O que entra é decidido em dois lugares que precisam concordar: o `where` de `financeiro-queries.ts`
 * (status, transferência, acessório) e `entraNoPortal` aqui (licitação, que depende da configuração).
 */
import { paraCentavos } from "@/modules/financeiro/liquidez/dinheiro";
import { ehRecebivelDeLicitacao } from "@/modules/financeiro/avisos/regras";

type Valor = number | string | { toString(): string };

/** Um recebível do cliente como sai do banco, com as datas já em `YYYY-MM-DD`. */
export type RecebivelDoCliente = {
  id: string;
  status: "previsto" | "confirmado";
  valor: Valor;
  valorEfetivo: Valor | null;
  data: string;
  vencimento: string | null;
  dataConfirmacao: string | null;
  /** Soma das retenções da nota, em centavos: o cliente que retém imposto paga o líquido. */
  retidoCentavos: number;
  projeto: { codigo: string; nome: string } | null;
};

export type SituacaoParcela = "vencida" | "a_vencer" | "paga";

export const SITUACAO_PARCELA_LABEL: Record<SituacaoParcela, string> = {
  vencida: "Vencida",
  a_vencer: "A vencer",
  paga: "Paga",
};

export type ParcelaDoCliente = {
  id: string;
  situacao: SituacaoParcela;
  /** Em aberto: o que falta pagar. Paga: o que foi pago. Sempre o líquido das retenções. */
  valorCentavos: number;
  vencimento: string;
  pagaEm: string | null;
  projeto: { codigo: string; nome: string } | null;
};

export type FinanceiroDoCliente = {
  emAberto: ParcelaDoCliente[];
  pagas: ParcelaDoCliente[];
  totais: { vencidoCentavos: number; aVencerCentavos: number; pagoCentavos: number };
};

/**
 * Licitação fica fora do portal pela mesma regra da cobrança ao cliente: só entra se a configuração
 * "cobrar licitação" estiver ligada (Configurações → Avisos de vencimento).
 */
export function entraNoPortal(r: {
  projetoTipo: string | null | undefined;
  chavesDaCategoria: readonly (string | null | undefined)[];
  cobrarLicitacao: boolean;
}): boolean {
  return r.cobrarLicitacao || !ehRecebivelDeLicitacao(r);
}

/** Situação e valor de uma parcela vistos pelo cliente. `hoje` = dia de São Paulo, `YYYY-MM-DD`. */
export function parcelaDoCliente(r: RecebivelDoCliente, hoje: string): ParcelaDoCliente {
  const vencimento = r.vencimento ?? r.data;
  const bruto = paraCentavos(r.status === "confirmado" ? (r.valorEfetivo ?? r.valor) : r.valor);
  const valorCentavos = Math.max(0, bruto - r.retidoCentavos);
  if (r.status === "confirmado") {
    return { id: r.id, situacao: "paga", valorCentavos, vencimento, pagaEm: r.dataConfirmacao ?? r.data, projeto: r.projeto };
  }
  return {
    id: r.id,
    situacao: vencimento < hoje ? "vencida" : "a_vencer",
    valorCentavos,
    vencimento,
    pagaEm: null,
    projeto: r.projeto,
  };
}

/** Separa em aberto (mais antiga primeiro) e pagas (mais recente primeiro) e soma cada situação. */
export function financeiroDoCliente(rs: readonly RecebivelDoCliente[], hoje: string): FinanceiroDoCliente {
  const parcelas = rs.map((r) => parcelaDoCliente(r, hoje));
  const emAberto = parcelas
    .filter((p) => p.situacao !== "paga")
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.id.localeCompare(b.id));
  const pagas = parcelas
    .filter((p) => p.situacao === "paga")
    .sort((a, b) => (b.pagaEm ?? "").localeCompare(a.pagaEm ?? "") || a.id.localeCompare(b.id));
  const soma = (s: SituacaoParcela) =>
    parcelas.filter((p) => p.situacao === s).reduce((t, p) => t + p.valorCentavos, 0);
  return {
    emAberto,
    pagas,
    totais: { vencidoCentavos: soma("vencida"), aVencerCentavos: soma("a_vencer"), pagoCentavos: soma("paga") },
  };
}
