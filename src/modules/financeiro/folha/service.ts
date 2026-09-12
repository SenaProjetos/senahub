/**
 * Regras puras da folha de projetistas (Produção) — sem Prisma client, sem Next.
 * Compartilhadas pelas actions de pagamento individual e de lote.
 */

import { diferencaEmDias, inicioDoDiaLocal, inicioDoDiaUtc } from "@/lib/data";
import { brl } from "@/lib/utils";
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
    // Desde a F11 o pago tem porta própria ("Corrigir pagamento"); esta só vale para pendente.
    pago: "Este pagamento já foi efetivado — use \"Corrigir pagamento\" na linha dele.",
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

/** O que a correção de um pagamento efetivado precisa saber do lançamento vinculado. */
export type EstadoLancamentoCorrecao = {
  status: string;
  /** Tem `TransacaoBancaria` ligada — mesmo teste da tela de Lançamentos (`transacao != null`). */
  conciliado: boolean;
  /** Baixa parcial (`valorEfetivo` preenchido) — trocar o valor aqui deixaria o saldo ambíguo. */
  parcial: boolean;
};

/**
 * Regra da correção de um pagamento JÁ efetivado (F11, decisão N6): só `pago`, com
 * lançamento confirmado no caixa. Separada de `erroTransicao` de propósito: aquela continua
 * valendo "só pendente" para pagar/editar/cancelar.
 *
 * Conciliado NÃO entra aqui — ver `erroCorrecaoConciliada` e o porquê da mudança (G1a).
 *
 * Pura — a tela usa a mesma regra para dizer o motivo sem abrir um dialog fadado a falhar.
 */
export function erroCorrecaoEfetivado(status: string, lanc: EstadoLancamentoCorrecao | null): string | null {
  if (status !== "pago") return "Só um pagamento já efetivado é corrigido por aqui — pendente se edita pelo lápis da linha.";
  if (!lanc) return "Este pagamento não tem lançamento no caixa — não há o que corrigir.";
  if (lanc.status !== "confirmado") return "O lançamento deste pagamento não está confirmado no caixa — corrija pela tela de Lançamentos.";
  if (lanc.parcial) return "O lançamento deste pagamento tem baixa parcial — corrija pela tela de Lançamentos.";
  return null;
}

/**
 * Estorno de um pagamento JÁ efetivado (G1b/D31): desfaz o pagamento inteiro — vira
 * `cancelado`, o lançamento é cancelado e a linha sai do lote. É a porta que a N6 supôs
 * existir ("a saída é cancelar") e que nunca foi construída: `erroTransicao("cancelar")`
 * recusa pago, de propósito, porque cancelar em silêncio um pagamento já no caixa seria pior.
 *
 * Conciliado NÃO estorna: o dinheiro saiu da conta de verdade, e o extrato registra isso.
 * Apagar a saída do caixa deixaria o sistema divergente do banco — o certo é lançar a
 * devolução (entrada) quando ela acontecer.
 */
export function erroEstornoEfetivado(status: string, lanc: EstadoLancamentoCorrecao | null): string | null {
  if (status !== "pago") {
    return "Só um pagamento efetivado é estornado por aqui — um pendente se cancela pelo botão de cancelar da linha.";
  }
  if (lanc?.conciliado) {
    return "Este pagamento está conciliado com o extrato: o dinheiro saiu da conta de verdade. Estornar apagaria do caixa uma saída que o banco registrou — lance a devolução no caixa quando ela entrar.";
  }
  if (lanc?.parcial) return "O lançamento deste pagamento tem baixa parcial — resolva pela tela de Lançamentos.";
  return null;
}

/** O que a transação conciliada diz que saiu da conta — o extrato, em forma de dado. */
export type TransacaoConciliada = { valor: number; contaId: string | null };

/**
 * Correção de uma linha CONCILIADA (G1a/D31). A F11 travava conciliado por completo, o que
 * deixava um beco sem saída: o valor errado ficava errado para sempre, porque desfazer a
 * conciliação também não existe e cancelar um pagamento pago é recusado.
 *
 * A saída é reconhecer quem manda: o extrato. Conciliado, a correção passa só se o
 * resultado BATER com a transação — que é exatamente o caso comum ("lancei 1.500, o banco
 * mostra 1.450"). Mudar o que de fato saiu do banco não é corrigir um registro: é um
 * estorno no caixa, e a mensagem manda para lá.
 */
export function erroCorrecaoConciliada(
  t: TransacaoConciliada,
  novo: { valor: number; contaId: string },
): string | null {
  // `Math.abs`: saída de dinheiro vem negativa no OFX; o pagamento é sempre positivo.
  const esperado = Math.abs(t.valor);
  // Meio centavo de tolerância: de um lado `Decimal(14,2)`, do outro um campo de tela.
  if (Math.abs(novo.valor - esperado) > 0.005) {
    return `Este pagamento está conciliado com o extrato: o valor precisa ficar igual ao da transação (${brl(esperado)}). Se o que saiu do banco foi outro, registre um estorno no caixa.`;
  }
  if (t.contaId && novo.contaId !== t.contaId) {
    return "Este pagamento está conciliado com o extrato: a conta precisa continuar sendo a da transação conciliada.";
  }
  return null;
}

/**
 * Reduz um texto livre (a busca do filtro) a algo seguro num nome de arquivo: sem
 * acento, minúsculo, só `a-z0-9` e `-`. Vazio quando o texto não sobra nada (só símbolos).
 */
function slug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

/**
 * Nome do arquivo exportado (F7/D28), incluindo o filtro aplicado — sem isso, dois exports
 * com filtro diferente caem os dois como "Producao.xlsx" e o Windows empilha
 * "Producao (1).xlsx", "(2)"... sem dizer qual é qual.
 */
export function nomeArquivoExport(f: FiltrosFolha, formato: "csv" | "xlsx"): string {
  const partes: string[] = ["Producao"];
  if (f.status) partes.push(f.status);
  if (f.de) partes.push(`de-${f.de}`);
  if (f.ate) partes.push(`ate-${f.ate}`);
  if (f.q) {
    const s = slug(f.q);
    if (s) partes.push(`busca-${s}`);
  }
  return `${partes.join("-")}.${formato}`;
}
