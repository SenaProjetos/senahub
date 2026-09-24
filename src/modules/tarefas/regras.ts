/**
 * Regras de permissão de tarefa no CLIENTE — espelho dos gates do servidor, em um lugar só.
 *
 * Puro (sem `server-only`, sem Prisma): board, diálogo e descritor de ações passam a julgar
 * igual, e o julgamento fica testável. O servidor continua sendo a autoridade — isto aqui só
 * evita oferecer ao usuário o que vai falhar lá.
 *
 * `gereTodas` é a capacidade `tarefas:gerir_todas` (`SessionUser.gereTodasTarefas`), resolvida
 * no servidor pelo perfil de acesso. Não é papel: um CLT com o perfil certo gere tudo, e um
 * supervisor sem ele, não.
 */

/** O que basta saber de uma tarefa para julgar acesso. */
export type TarefaParaRegra = {
  criadorId: string;
  responsaveis: readonly { id: string }[];
};

/**
 * Pode mover no quadro (e, em geral, mexer na tarefa).
 *
 * Espelha `escopoTarefa` (`modules/tarefas/queries.ts`), usado por `exigirAcessoTarefa`
 * (`actions.ts`) em `moverTarefa`: fora desse escopo o servidor nem enxerga a tarefa.
 */
export function podeMoverTarefa(t: TarefaParaRegra, meId: string, gereTodas: boolean): boolean {
  return gereTodas || t.criadorId === meId || t.responsaveis.some((r) => r.id === meId);
}

/**
 * Pode editar/arquivar. Mais estreito que mover: responsável **não** edita.
 *
 * Espelha `exigirCriadorOuGlobal` (`actions.ts`), que guarda `editarTarefa` e `arquivarTarefa`.
 */
export function podeEditarTarefa(
  t: Pick<TarefaParaRegra, "criadorId">,
  meId: string,
  gereTodas: boolean,
): boolean {
  return gereTodas || t.criadorId === meId;
}

/** Motivo de não poder editar — a mesma frase do `ActionError` de `exigirCriadorOuGlobal`. */
export const MOTIVO_NAO_EDITA =
  "Só quem criou a tarefa (ou quem gere as tarefas de todos) pode editá-la.";

/** Motivo de não poder mover. O servidor responde "Tarefa não encontrada." (fora do escopo). */
export const MOTIVO_NAO_MOVE =
  "Só quem criou a tarefa, seus responsáveis ou quem gere as tarefas de todos podem movê-la.";

/** Motivo de não concluir — a mesma frase do `ActionError` de `moverTarefa`. */
export const MOTIVO_BLOQUEADA = "Tarefa bloqueada: conclua as dependências primeiro.";

/**
 * Campos que o card herda da linha do cronograma (F5 — D32, "estrutura desce, progresso
 * sobe"): título, prazo, projeto, disciplina e responsáveis. A EAP é a fonte deles e os
 * reescreve a cada reprogramação — uma edição feita no card seria desfeita em silêncio na
 * próxima. Status, checklist, prioridade e comentário continuam do card.
 */
export type CamposDoCronograma = {
  titulo: string;
  /** `YYYY-MM-DD` ou nulo. */
  prazo: string | null;
  projetoId: string | null;
  disciplinaId: string | null;
  responsaveisIds: readonly string[];
};

const ROTULO_CAMPO: Record<keyof CamposDoCronograma, string> = {
  titulo: "título",
  prazo: "prazo",
  projetoId: "projeto",
  disciplinaId: "disciplina",
  responsaveisIds: "responsáveis",
};

/**
 * Quais campos vindos do cronograma a edição tenta mudar. O formulário reenvia tudo
 * sempre: valor IGUAL ao atual não conta como mudança (mesma regra do prazo da disciplina
 * com etapas). Responsáveis comparam como conjunto — a ordem na tela não importa.
 */
export function camposDoCronogramaAlterados(atual: CamposDoCronograma, novo: CamposDoCronograma): string[] {
  const out: string[] = [];
  if (atual.titulo !== novo.titulo) out.push(ROTULO_CAMPO.titulo);
  if ((atual.prazo ?? null) !== (novo.prazo || null)) out.push(ROTULO_CAMPO.prazo);
  if ((atual.projetoId ?? null) !== (novo.projetoId || null)) out.push(ROTULO_CAMPO.projetoId);
  if ((atual.disciplinaId ?? null) !== (novo.disciplinaId || null)) out.push(ROTULO_CAMPO.disciplinaId);
  const a = new Set(atual.responsaveisIds);
  const b = new Set(novo.responsaveisIds);
  if (a.size !== b.size || [...a].some((id) => !b.has(id))) out.push(ROTULO_CAMPO.responsaveisIds);
  return out;
}

/** Mensagem de recusa: diz o que não pode e onde mudar. */
export function motivoCampoDoCronograma(campos: readonly string[]): string {
  const lista = campos.length === 1 ? campos[0] : `${campos.slice(0, -1).join(", ")} e ${campos[campos.length - 1]}`;
  return `Este card vem do cronograma: ${lista} se ${campos.length === 1 ? "muda" : "mudam"} na EAP do projeto, não aqui.`;
}
