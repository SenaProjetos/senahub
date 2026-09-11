/**
 * Regras puras da folha de projetistas (Produção) — sem Prisma client, sem Next.
 * Compartilhadas pelas actions de pagamento individual e de lote.
 */

import { diferencaEmDias, inicioDoDiaLocal, inicioDoDiaUtc } from "@/lib/data";
import { DIAS_PENDENTE_PARADO, type FiltroStatus, type FiltrosFolha } from "./status";

/** Decimal do Prisma ou número já serializado — `Number()` resolve os dois. */
type Valor = number | { toString(): string };

type RawParams = Record<string, string | string[] | undefined>;

const FILTROS_STATUS: readonly FiltroStatus[] = ["pendente", "pago", "cancelado", "todos"];
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function primeiro(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

/** Lê e valida os filtros da aba Pagamentos. Valor inválido na URL cai no padrão, nunca quebra. */
export function lerFiltrosFolha(sp: RawParams): FiltrosFolha {
  const status = primeiro(sp.status);
  const de = primeiro(sp.de);
  const ate = primeiro(sp.ate);
  return {
    status: (FILTROS_STATUS as readonly string[]).includes(status) ? (status as FiltroStatus) : null,
    projetistaId: primeiro(sp.projetistaId),
    projetoId: primeiro(sp.projetoId),
    de: DATA_ISO.test(de) ? de : "",
    ate: DATA_ISO.test(ate) ? ate : "",
    q: primeiro(sp.q),
  };
}

/** Fragmento de `where` do status. Padrão (`null`) esconde cancelados; `todos` não filtra. */
export function whereDoStatus(status: FiltroStatus | null): { status?: "pendente" | "pago" | "cancelado" | { not: "cancelado" } } {
  if (status === null) return { status: { not: "cancelado" } };
  if (status === "todos") return {};
  return { status };
}

/** Algum filtro além do status? (decide o texto do vazio e a legenda dos totais) */
export function temFiltroAlemDoStatus(f: FiltrosFolha): boolean {
  return Boolean(f.projetistaId || f.projetoId || f.de || f.ate || f.q);
}

/**
 * Dias que um pagamento pendente está parado desde a liberação, ou `null` se ainda não
 * passou do limite (`DIAS_PENDENTE_PARADO`). Passa pela regra única de `lib/data.ts`.
 */
export function diasPendenteParado(liberadoEm: Date | string, agora: Date = new Date()): number | null {
  const dias = diferencaEmDias(liberadoEm, inicioDoDiaLocal(agora));
  return dias != null && dias >= DIAS_PENDENTE_PARADO ? dias : null;
}

export const MSG_PAGAMENTO_SEM_VALOR =
  "Este pagamento está sem valor — corrija o valor antes de pagar.";

export const MSG_LOTE_SEM_VALOR =
  "Todos os pagamentos pendentes deste lote estão sem valor — corrija os valores antes de pagar.";

/**
 * Pagamento só pode ser efetivado com valor positivo. Pagar R$ 0,00 cria um `Lancamento`
 * CONFIRMADO de R$ 0,00 no caixa (`confirmarDespesaProjetista` não tem previsto para
 * reaproveitar nessas linhas, então cria um novo) — sujeira contábil sem volta pela tela.
 */
export function temValorPagavel(valor: Valor): boolean {
  return Number(valor) > 0;
}

/**
 * Separa os pendentes de um lote entre pagáveis e sem valor. O lote paga os pagáveis e
 * deixa os sem valor pendentes — um lote com linha zerada não bloqueia o resto.
 */
export function separarPagaveis<T extends { valor: Valor }>(pagamentos: T[]) {
  const pagaveis: T[] = [];
  const semValor: T[] = [];
  for (const p of pagamentos) (temValorPagavel(p.valor) ? pagaveis : semValor).push(p);
  return { pagaveis, semValor };
}

/**
 * Instante gravado como data do pagamento (`pagoEm`, `dataConfirmacao` do lançamento).
 * Com data do formulário (`yyyy-mm-dd`): `new Date` lê como meia-noite UTC — o mesmo que o
 * Prisma grava de um `<input type="date">`. Sem data: meia-noite UTC do dia LOCAL. Não é
 * `new Date()` — depois das 21h em BRT o instante já é o dia seguinte em UTC, e o
 * lançamento (`@db.Date`) saía datado de amanhã.
 */
export function quandoDoPagamento(data: string | undefined, agora: Date = new Date()): Date {
  return data ? new Date(data) : inicioDoDiaUtc(agora);
}

export type AcaoPagamento = "pagar" | "editar" | "cancelar";

const MSG_TRANSICAO: Record<AcaoPagamento, { pago: string; cancelado: string }> = {
  pagar: {
    pago: "Pagamento já efetivado.",
    cancelado: "Este pagamento foi cancelado — não pode ser pago.",
  },
  editar: {
    pago: "Este pagamento já foi efetivado — o valor não pode mais ser alterado.",
    cancelado: "Este pagamento foi cancelado — o valor não pode mais ser alterado.",
  },
  cancelar: {
    pago: "Este pagamento já foi efetivado — não pode mais ser cancelado por aqui.",
    cancelado: "Este pagamento já está cancelado.",
  },
};

/**
 * Regra única de transição de `PagamentoProjetista`: pagar, editar valor e cancelar só
 * valem para `pendente`. Devolve a mensagem para o usuário, ou `null` se pode.
 *
 * `pendente` explícito, nunca `!= pago` (§5 do plano): até a F5 o pagamento individual só
 * recusava `pago`, e um cancelado — com a tela aberta de antes — era pago de novo.
 */
export function erroTransicao(acao: AcaoPagamento, status: string): string | null {
  if (status === "pendente") return null;
  if (status === "pago") return MSG_TRANSICAO[acao].pago;
  if (status === "cancelado") return MSG_TRANSICAO[acao].cancelado;
  return "Este pagamento não está pendente.";
}
