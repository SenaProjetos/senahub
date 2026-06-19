/**
 * Máquina de estados de `Licitacao.status`.
 *
 * Transições MANUAIS (via editarLicitacao / UI):
 *   em_andamento → ganha | perdida
 *   em_execucao  → concluida
 * Transições de SISTEMA (somente via importarLicitacao):
 *   ganha → em_execucao
 *
 * `de === para` é sempre permitido (edição que não muda o status).
 * Os valores e a ordem do enum espelham `StatusLicitacao` no schema do Prisma.
 */

export const STATUS_LICITACAO = [
  "em_andamento",
  "ganha",
  "perdida",
  "em_execucao",
  "concluida",
] as const;

export type StatusLicitacao = (typeof STATUS_LICITACAO)[number];

export const STATUS_LICITACAO_LABEL: Record<StatusLicitacao, string> = {
  em_andamento: "Em andamento",
  ganha: "Ganha",
  perdida: "Perdida",
  em_execucao: "Em execução",
  concluida: "Concluída",
};

/** Transições disparadas manualmente pelo usuário. */
const TRANSICOES_MANUAIS: Record<StatusLicitacao, readonly StatusLicitacao[]> = {
  em_andamento: ["ganha", "perdida"],
  ganha: [], // ganha → em_execucao somente via importarLicitacao
  perdida: [],
  em_execucao: ["concluida"],
  concluida: [],
};

/** Transições disparadas pelo sistema (importarLicitacao). */
const TRANSICOES_SISTEMA: Partial<Record<StatusLicitacao, readonly StatusLicitacao[]>> = {
  ganha: ["em_execucao"],
};

/**
 * Decide se a mudança de status `de → para` é permitida.
 * Passe `viaImport: true` para liberar as transições de sistema.
 */
export function transicaoPermitida(
  de: StatusLicitacao,
  para: StatusLicitacao,
  opts: { viaImport?: boolean } = {},
): boolean {
  if (de === para) return true;
  if (TRANSICOES_MANUAIS[de]?.includes(para)) return true;
  if (opts.viaImport && TRANSICOES_SISTEMA[de]?.includes(para)) return true;
  return false;
}

/** Mensagem padrão para uma transição rejeitada. */
export function mensagemTransicaoInvalida(de: StatusLicitacao, para: StatusLicitacao): string {
  return `Transição de status inválida: ${STATUS_LICITACAO_LABEL[de]} → ${STATUS_LICITACAO_LABEL[para]}.`;
}

/** Medição só pode ser registrada em licitação em execução com projeto vinculado. */
export function podeMedirLicitacao(lic: {
  status: StatusLicitacao;
  projetoId: string | null;
}): boolean {
  return lic.status === "em_execucao" && lic.projetoId != null;
}
