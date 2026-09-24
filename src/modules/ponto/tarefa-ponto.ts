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
};

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

/**
 * Lista curta do ponto: card de EAP só dentro da janela; card manual (sem cronograma) sempre.
 * Ordem: o que está NA janela exata agora primeiro, depois prazo mais próximo (sem prazo por
 * último), depois título. Limitada a `MAX_TAREFAS_NO_PONTO`.
 *
 * Quem chama já filtrou o que é da pessoa, do projeto e ainda aberto — aqui é só o recorte
 * de período e a ordem.
 */
export function tarefasDoPeriodo(candidatas: readonly TarefaCandidata[], hoje: string): TarefaCandidata[] {
  const noPeriodo = candidatas.filter((t) => t.janela == null || naJanela(t.janela, hoje));
  const agoraExato = (t: TarefaCandidata) => t.janela != null && hoje >= t.janela.inicio && hoje <= t.janela.fim;
  return [...noPeriodo]
    .sort((a, b) => {
      const ea = agoraExato(a) ? 0 : 1;
      const eb = agoraExato(b) ? 0 : 1;
      if (ea !== eb) return ea - eb;
      if (a.prazo !== b.prazo) return a.prazo == null ? 1 : b.prazo == null ? -1 : a.prazo.localeCompare(b.prazo);
      return a.titulo.localeCompare(b.titulo, "pt-BR");
    })
    .slice(0, MAX_TAREFAS_NO_PONTO);
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
