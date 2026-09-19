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
