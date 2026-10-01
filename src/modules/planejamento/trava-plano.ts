/**
 * Trava do plano depois da aprovação (reunião de 29/09/2026: "depois de aprovado, não dá para ficar mexendo no
 * planejado"). PURO: sem I/O, serve às actions (a recusa) e à tela (o que fica desabilitado, com a MESMA frase).
 *
 * Aprovado, o PLANO fica travado: estrutura (inserir, excluir, mover, recuar/avançar), durações, marco,
 * disciplina/fase da linha, dependências, restrições e o início do projeto. O ACOMPANHAMENTO continua livre:
 * % concluído, datas reais, Data de Status, pessoas e horas, bloqueio e o nome da linha.
 *
 * "Revisar planejamento" destrava; a revisão só fecha com uma NOVA LINHA DE BASE (com motivo) — é o que garante
 * que toda mudança do combinado deixa rastro. Revisão aberta sem mudança nenhuma pode ser cancelada.
 */

export type EstadoTrava = { aprovado: boolean; emRevisao: boolean };

export const MOTIVO_PLANO_TRAVADO =
  "O cronograma está aprovado: o plano (estrutura, durações, dependências e restrições) está travado. Para mudar, clique em \"Revisar planejamento\" — a revisão fecha com uma nova linha de base.";
export const MOTIVO_JA_EM_REVISAO = "O planejamento já está em revisão.";
export const MOTIVO_REVISAO_SEM_APROVACAO = "Só se revisa um cronograma aprovado — o rascunho já é editável.";
export const MOTIVO_CANCELAR_COM_MUDANCA =
  "O plano já mudou nesta revisão: ela só fecha com uma nova linha de base, com o motivo da mudança.";
export const MOTIVO_NAO_ESTA_EM_REVISAO = "O planejamento não está em revisão.";

/** Rascunho é livre; aprovado trava, salvo durante a revisão. Sem cronograma (`null`) = rascunho. */
export function planoTravado(c: EstadoTrava | null | undefined): boolean {
  return !!c && c.aprovado && !c.emRevisao;
}

/** Abrir a revisão: só aprovado e ainda fechado. `null` = pode. */
export function impedimentoParaAbrirRevisao(c: EstadoTrava | null | undefined): string | null {
  if (!c?.aprovado) return MOTIVO_REVISAO_SEM_APROVACAO;
  if (c.emRevisao) return MOTIVO_JA_EM_REVISAO;
  return null;
}

/** Cancelar a revisão: só aberta e sem mudança no plano (senão, só a nova linha de base fecha). */
export function impedimentoParaCancelarRevisao(
  c: (EstadoTrava & { revisaoAlterada: boolean }) | null | undefined,
): string | null {
  if (!c?.emRevisao) return MOTIVO_NAO_ESTA_EM_REVISAO;
  if (c.revisaoAlterada) return MOTIVO_CANCELAR_COM_MUDANCA;
  return null;
}

/**
 * A edição de uma linha ("Informações da tarefa" ou a célula da grade) manda a linha INTEIRA — nome e % junto com
 * duração e disciplina. Só recusa se um campo do PLANO de fato mudou: renomear ou informar o % segue livre.
 * `depois.etapaId === undefined` = o campo não veio (não mexe); `duracaoDias === undefined` = não grava duração.
 */
export function mudaCampoDoPlano(
  antes: { tipoEap: string; duracaoDias: number; disciplinaId: string | null; etapaId: string | null },
  depois: { tipoEap: string; duracaoDias: number | undefined; disciplinaId: string | null; etapaId: string | null | undefined },
): boolean {
  if (antes.tipoEap !== depois.tipoEap) return true;
  // Duração é decimal no banco: compara com tolerância, para 2 e 2.0 não parecerem mudança.
  if (depois.duracaoDias !== undefined && Math.abs(depois.duracaoDias - antes.duracaoDias) > 1e-9) return true;
  if ((antes.disciplinaId ?? null) !== (depois.disciplinaId ?? null)) return true;
  if (depois.etapaId !== undefined && (antes.etapaId ?? null) !== (depois.etapaId ?? null)) return true;
  return false;
}
