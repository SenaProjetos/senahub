/**
 * Tarefa no ponto (F6 — D20). Regras puras, sem I/O.
 *
 * O ponto passa a registrar EM QUE TAREFA a pessoa trabalhou, mas sem virar burocracia (Q20):
 * a tarefa é opcional, a lista é curta, e sessão sem tarefa vale exatamente como valia.
 *
 * Datas em `YYYY-MM-DD`.
 */
import type { TipoAlocacaoPonto } from "@/modules/ponto/alocacao";

/** "Curta" de verdade: o ponto é um clique, não uma escolha entre 60 cards. */
export const MAX_TAREFAS_NO_PONTO = 8;

/** Folga, em dias, em volta da janela da linha da EAP para a tarefa ainda aparecer. */
export const FOLGA_JANELA_DIAS = 7;

export type TarefaCandidata = {
  id: string;
  titulo: string;
  prazo: string | null;
  /** Janela da linha da EAP que gerou o card; `null` = card manual, sem cronograma. */
  janela: { inicio: string; fim: string } | null;
  /**
   * Etapa da linha da EAP (`disciplinaId:etapaId`), para "outras da etapa"; `null` = card manual
   * ou linha sem fase.
   */
  etapa?: string | null;
};

/** Uma tarefa como o ponto a oferece: no período (lista principal) ou só da mesma etapa. */
export type TarefaNoPonto = TarefaCandidata & {
  /** O término da linha já passou e o card segue aberto. */
  atrasada: boolean;
  /** `periodo` = lista curta; `etapa` = recolhida em "outras da etapa". */
  grupo: "periodo" | "etapa";
};

/** Teto das "outras da etapa": é recolhido, mas continua sendo uma escolha, não o projeto inteiro. */
export const MAX_OUTRAS_DA_ETAPA = 20;

function somarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * A janela da linha (com folga) cobre hoje? É o "só as tarefas em que a pessoa está alocada
 * no período" da D20: um card de EAP que só começa daqui a dois meses, ou que terminou há
 * três, não é o que a pessoa está fazendo agora.
 */
export function naJanela(janela: { inicio: string; fim: string }, hoje: string): boolean {
  return hoje >= somarDias(janela.inicio, -FOLGA_JANELA_DIAS) && hoje <= somarDias(janela.fim, FOLGA_JANELA_DIAS);
}

/** O término da linha já passou? Só para card de EAP — card manual não tem cronograma. */
export function estaAtrasada(janela: { inicio: string; fim: string } | null, hoje: string): boolean {
  return janela != null && hoje > janela.fim;
}

const agoraExato = (t: TarefaCandidata, hoje: string) => t.janela != null && hoje >= t.janela.inicio && hoje <= t.janela.fim;

/**
 * Lista curta do ponto (D20 + reunião de 08/10/2026, decisão 1 — o "híbrido"):
 *  - card de EAP dentro da janela (com a folga de 7 dias) entra;
 *  - card de EAP ATRASADO (término passou) e ainda aberto entra SEMPRE — é justamente quando a
 *    pessoa ainda está trabalhando nele, e antes ele sumia uma semana depois do término;
 *  - card manual (sem cronograma) entra sempre.
 * Ordem: atrasadas primeiro (a de término mais antigo antes), depois o que está na janela exata
 * agora, depois prazo mais próximo (sem prazo por último), depois título. Teto
 * `MAX_TAREFAS_NO_PONTO` — o que passa do teto vai para "outras da etapa" (`listaDoPonto`).
 *
 * Quem chama já filtrou o que é da pessoa, do projeto e ainda aberto — aqui é só o recorte
 * de período e a ordem.
 */
export function tarefasDoPeriodo(candidatas: readonly TarefaCandidata[], hoje: string): TarefaNoPonto[] {
  return ordenarPeriodo(candidatas, hoje).slice(0, MAX_TAREFAS_NO_PONTO);
}

function ordenarPeriodo(candidatas: readonly TarefaCandidata[], hoje: string): TarefaNoPonto[] {
  const noPeriodo = candidatas.filter((t) => t.janela == null || naJanela(t.janela, hoje) || estaAtrasada(t.janela, hoje));
  return noPeriodo
    .map((t): TarefaNoPonto => ({ ...t, atrasada: estaAtrasada(t.janela, hoje), grupo: "periodo" }))
    .sort((a, b) => {
      if (a.atrasada !== b.atrasada) return a.atrasada ? -1 : 1;
      if (a.atrasada && b.atrasada && a.janela!.fim !== b.janela!.fim) return a.janela!.fim.localeCompare(b.janela!.fim);
      const ea = agoraExato(a, hoje) ? 0 : 1;
      const eb = agoraExato(b, hoje) ? 0 : 1;
      if (ea !== eb) return ea - eb;
      if (a.prazo !== b.prazo) return a.prazo == null ? 1 : b.prazo == null ? -1 : a.prazo.localeCompare(b.prazo);
      return a.titulo.localeCompare(b.titulo, "pt-BR");
    });
}

/**
 * A lista inteira que o ponto oferece: a curta (`grupo: "periodo"`) e, recolhidas, as "outras da
 * etapa" (`grupo: "etapa"`) — cards da pessoa na MESMA etapa (disciplina + fase) de algum card da
 * lista curta, que ficaram fora da janela (quem adianta mais de uma semana), mais o que passou do
 * teto da lista curta. Nunca o projeto inteiro: etapa futura de outra fase não aparece.
 * Ordem das outras: início da linha, depois título. Teto `MAX_OUTRAS_DA_ETAPA`.
 */
export function listaDoPonto(candidatas: readonly TarefaCandidata[], hoje: string): TarefaNoPonto[] {
  const ordenadas = ordenarPeriodo(candidatas, hoje);
  const principais = ordenadas.slice(0, MAX_TAREFAS_NO_PONTO);
  const sobra = ordenadas.slice(MAX_TAREFAS_NO_PONTO);
  const usadas = new Set(principais.map((t) => t.id));
  const etapas = new Set(principais.map((t) => t.etapa).filter((e): e is string => e != null));
  const daEtapa = candidatas.filter((t) => !usadas.has(t.id) && t.etapa != null && etapas.has(t.etapa));
  const outras = new Map<string, TarefaNoPonto>();
  for (const t of [...sobra, ...daEtapa]) {
    if (!outras.has(t.id)) outras.set(t.id, { ...t, atrasada: estaAtrasada(t.janela, hoje), grupo: "etapa" });
  }
  const resto = [...outras.values()]
    .sort((a, b) => {
      const ia = a.janela?.inicio ?? "9999";
      const ib = b.janela?.inicio ?? "9999";
      if (ia !== ib) return ia.localeCompare(ib);
      return a.titulo.localeCompare(b.titulo, "pt-BR");
    })
    .slice(0, MAX_OUTRAS_DA_ETAPA);
  return [...principais, ...resto];
}

/**
 * Para onde o ponto já abre apontado (decisão 1 da reunião de 08/10/2026): o projeto e a
 * atividade de hoje, em vez de "Sem projeto" — que era a causa de muita gente bater ponto sem
 * projeto. Só card de EAP conta (é ele que diz "o que é para hoje"): primeiro o atrasado de
 * término mais antigo (é o que a pessoa ainda está fazendo e o seguinte costuma depender dele),
 * depois o que está na janela exata hoje, pelo início. `null` = nada no cronograma para hoje — o
 * ponto segue o padrão de antes.
 */
export function sugestaoDoPonto<T extends TarefaCandidata & { projetoId: string }>(
  candidatas: readonly T[],
  hoje: string,
): T | null {
  const elegiveis = candidatas.filter((t) => t.janela != null && (estaAtrasada(t.janela, hoje) || agoraExato(t, hoje)));
  if (elegiveis.length === 0) return null;
  return [...elegiveis].sort((a, b) => {
    const aa = estaAtrasada(a.janela, hoje);
    const ab = estaAtrasada(b.janela, hoje);
    if (aa !== ab) return aa ? -1 : 1;
    const ka = aa ? a.janela!.fim : a.janela!.inicio;
    const kb = ab ? b.janela!.fim : b.janela!.inicio;
    if (ka !== kb) return ka.localeCompare(kb);
    return a.titulo.localeCompare(b.titulo, "pt-BR");
  })[0];
}

/**
 * A tarefa escolhida vale para esta sessão? Devolve o motivo (texto seguro para o usuário)
 * ou `null` se vale. Mesma frase na tela e na action.
 *
 * NÃO exige que a tarefa esteja aberta: se o card foi concluído entre a lista e o clique, as
 * horas ainda foram trabalhadas nele — recusar seria punir quem bateu ponto.
 */
export function motivoTarefaInvalida(
  sessao: { tipoAlocacao: TipoAlocacaoPonto; projetoId: string | null },
  tarefa: { projetoId: string | null; arquivada: boolean; responsaveisIds: readonly string[] } | null,
  userId: string,
): string | null {
  if (sessao.tipoAlocacao !== "projeto" || !sessao.projetoId) {
    return "Tarefa só vale quando a jornada está alocada num projeto.";
  }
  if (!tarefa || tarefa.arquivada) return "Tarefa não encontrada.";
  if (tarefa.projetoId !== sessao.projetoId) return "Esta tarefa não é do projeto escolhido.";
  if (!tarefa.responsaveisIds.includes(userId)) return "Você não é responsável por esta tarefa.";
  return null;
}

type BatidaComTarefa = { tipo: string; projetoId: string | null; tarefaId?: string | null };

const ABRE_SESSAO = new Set(["entrada", "fim_descanso"]);

/**
 * Editar o dia recria as batidas (e as sessões a partir delas) do zero: sem cuidado, a
 * tarefa escolhida na entrada sumiria em silêncio. Devolve, para cada batida NOVA, a tarefa
 * da batida ANTIGA que ocupava o mesmo lugar — casando por (tipo, projeto) e pela ordem de
 * ocorrência, não pelo horário, para sobreviver a quem só corrigiu a hora.
 *
 * Só batida que abre sessão (entrada, volta do descanso) carrega tarefa. Mudou o projeto da
 * batida? Não casa — a tarefa era do projeto antigo e a validação recusaria mesmo.
 */
export function herdarTarefasNaEdicao(
  antes: readonly BatidaComTarefa[],
  novas: readonly { tipo: string; projetoId: string | null }[],
): (string | null)[] {
  const chave = (b: { tipo: string; projetoId: string | null }) => `${b.tipo}|${b.projetoId ?? ""}`;
  const antigasPorChave = new Map<string, (string | null)[]>();
  for (const b of antes) {
    if (!ABRE_SESSAO.has(b.tipo)) continue;
    const k = chave(b);
    antigasPorChave.set(k, [...(antigasPorChave.get(k) ?? []), b.tarefaId ?? null]);
  }
  const vistas = new Map<string, number>();
  return novas.map((b) => {
    if (!ABRE_SESSAO.has(b.tipo)) return null;
    const k = chave(b);
    const i = vistas.get(k) ?? 0;
    vistas.set(k, i + 1);
    return antigasPorChave.get(k)?.[i] ?? null;
  });
}
