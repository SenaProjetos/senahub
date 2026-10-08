/**
 * Regras puras dos ciclos de entrada e saída (Gestão de Pessoas F4). Sem I/O: o service e as
 * telas usam as mesmas funções, e os testes cobrem cada decisão.
 *
 * Datas são dia-calendário `YYYY-MM-DD` (as colunas são `@db.Date`, meia-noite UTC).
 */

export type TipoCiclo = "entrada" | "saida";
export type StatusCiclo = "em_andamento" | "concluido" | "cancelado";
export type Responsavel = "rh" | "ti" | "lider" | "coordenador" | "pessoa";
export type Publico = "clt_estagio" | "pj" | "todos";
export type Contratacao = "clt" | "estagio" | "pj" | "autonomo_rpa" | "pro_labore";
type Dia = string;

export const TIPO_CICLO_LABEL: Record<TipoCiclo, string> = { entrada: "Entrada", saida: "Saída" };
export const STATUS_CICLO_LABEL: Record<StatusCiclo, string> = {
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
};
export const RESPONSAVEL_LABEL: Record<Responsavel, string> = {
  rh: "RH",
  ti: "TI",
  lider: "Líder",
  coordenador: "Coordenador",
  pessoa: "A própria pessoa",
};
export const PUBLICO_LABEL: Record<Publico, string> = {
  clt_estagio: "CLT e estágio",
  pj: "PJ",
  todos: "Qualquer contratação",
};

/** Decisão F4: uma lista para CLT/estágio e outra para PJ. Autônomo (RPA) segue a de PJ. */
export function publicoDaContratacao(c: Contratacao | null | undefined): Publico {
  if (c === "clt" || c === "estagio") return "clt_estagio";
  if (c === "pj" || c === "autonomo_rpa") return "pj";
  return "todos";
}

/**
 * A lista-modelo sugerida: a ativa do tipo certo para o público da contratação; sem ela, a de
 * "qualquer contratação"; sem nenhuma das duas, nenhuma. Empate → a de nome menor (estável).
 * É só sugestão: o RH pode escolher outra.
 */
export function modeloSugerido<T extends { id: string; nome: string; ativo: boolean; tipo: TipoCiclo; publico: Publico }>(
  modelos: readonly T[],
  tipo: TipoCiclo,
  contratacao: Contratacao | null | undefined,
): T | null {
  const doTipo = modelos.filter((m) => m.ativo && m.tipo === tipo).sort((a, b) => a.nome.localeCompare(b.nome));
  const publico = publicoDaContratacao(contratacao);
  return doTipo.find((m) => m.publico === publico) ?? doTipo.find((m) => m.publico === "todos") ?? null;
}

/** Âncora + prazo em dias corridos. Sem âncora ou sem prazo → sem data. */
export function prazoDoItem(ancora: Dia | null | undefined, prazoDias: number | null | undefined): Dia | null {
  if (!ancora || prazoDias == null || !Number.isFinite(prazoDias)) return null;
  const [a, m, d] = ancora.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + Math.trunc(prazoDias))).toISOString().slice(0, 10);
}

/** "D-1", "D0", "D+5" — como os prazos aparecem na lista-modelo. */
export function rotuloPrazo(prazoDias: number | null | undefined): string {
  if (prazoDias == null) return "sem prazo";
  if (prazoDias === 0) return "D0";
  return prazoDias > 0 ? `D+${prazoDias}` : `D${prazoDias}`;
}

export const MOTIVO_CICLO_ABERTO: Record<TipoCiclo, string> = {
  entrada: "Esta pessoa já tem uma lista de entrada em andamento. Conclua ou cancele antes de abrir outra.",
  saida: "Esta pessoa já tem uma lista de saída em andamento. Conclua ou cancele antes de abrir outra.",
};
export const MOTIVO_SAIDA_SEM_DESLIGAMENTO =
  "Agende o desligamento (último dia do vínculo) antes de abrir a lista de saída.";

/**
 * Pode abrir um ciclo deste tipo? Devolve a frase para o usuário, ou `null`.
 * Saída exige o último dia do vínculo: é a âncora dos prazos.
 */
export function motivoParaNaoAbrir(
  tipo: TipoCiclo,
  existentes: readonly { tipo: TipoCiclo; status: StatusCiclo }[],
  ultimoDiaVinculo: Dia | null | undefined,
): string | null {
  if (existentes.some((c) => c.tipo === tipo && c.status === "em_andamento")) return MOTIVO_CICLO_ABERTO[tipo];
  if (tipo === "saida" && !ultimoDiaVinculo) return MOTIVO_SAIDA_SEM_DESLIGAMENTO;
  return null;
}

/** Âncora do ciclo: início do vínculo na entrada (sem vínculo, hoje); último dia na saída. */
export function ancoraDoCiclo(
  tipo: TipoCiclo,
  vinculo: { dataInicio: Dia; dataFim: Dia | null } | null,
  hoje: Dia,
): Dia | null {
  if (tipo === "saida") return vinculo?.dataFim ?? null;
  return vinculo?.dataInicio ?? hoje;
}

/** Status do ciclo depois de marcar/desmarcar itens. Cancelado não volta sozinho. */
export function statusAposItens(atual: StatusCiclo, itens: readonly { concluido: boolean }[]): StatusCiclo {
  if (atual === "cancelado") return "cancelado";
  return itens.length > 0 && itens.every((i) => i.concluido) ? "concluido" : "em_andamento";
}

/** Atrasado = aberto e com prazo ANTES de hoje (o próprio dia do prazo ainda vale). */
export function itemAtrasado(item: { concluido: boolean; prazoEm: Dia | null }, hoje: Dia): boolean {
  return !item.concluido && !!item.prazoEm && item.prazoEm < hoje;
}

/**
 * Quem responde pelo item hoje. Liderança direta ainda não existe (F3) e coordenador não é um
 * papel fixo da pessoa: os dois ficam com o RH até haver de quem cobrar.
 */
export function responsavelEfetivo(r: Responsavel): "rh" | "ti" | "pessoa" {
  if (r === "ti" || r === "pessoa") return r;
  return "rh";
}

export const MOTIVO_SEM_PERMISSAO_ITEM = "Este item é de outro responsável. Peça ao RH para marcá-lo.";
export const MOTIVO_CICLO_FECHADO = "Este ciclo foi cancelado; os itens não podem mais ser marcados.";

/**
 * Quem pode marcar um item: o RH marca qualquer um; a TI marca os da TI; a própria pessoa marca
 * os dela. Devolve a frase de recusa, ou `null`.
 */
export function motivoParaNaoMarcar(
  item: { responsavel: Responsavel },
  ciclo: { status: StatusCiclo; userId: string },
  quem: { id: string; ehRh: boolean; ehTi: boolean },
): string | null {
  if (ciclo.status === "cancelado") return MOTIVO_CICLO_FECHADO;
  if (quem.ehRh) return null;
  const efetivo = responsavelEfetivo(item.responsavel);
  if (efetivo === "ti" && quem.ehTi) return null;
  if (efetivo === "pessoa" && quem.id === ciclo.userId) return null;
  return MOTIVO_SEM_PERMISSAO_ITEM;
}

/** Progresso `concluídos/total` e percentual inteiro. */
export function progresso(itens: readonly { concluido: boolean }[]): { feitos: number; total: number; pct: number } {
  const total = itens.length;
  const feitos = itens.filter((i) => i.concluido).length;
  return { feitos, total, pct: total > 0 ? Math.round((feitos / total) * 100) : 0 };
}
