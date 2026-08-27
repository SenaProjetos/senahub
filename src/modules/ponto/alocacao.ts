/**
 * Valores especiais do seletor de alocação. Não são IDs de projeto e nunca são
 * persistidos como tal: antes de gravar, `normalizarAlocacaoPonto` os converte
 * na categoria correspondente da sessão.
 */
export const ALOCACAO_SEM_PROJETO = "__sem_projeto";
export const ALOCACAO_REUNIAO_INTERNA = "__reuniao_interna";
export const ALOCACAO_REUNIAO_EXTERNA = "__reuniao_externa";

export type TipoAlocacaoPonto =
  | "projeto"
  | "sem_projeto"
  | "reuniao_interna"
  | "reuniao_externa";

export const ROTULO_TIPO_ALOCACAO: Record<Exclude<TipoAlocacaoPonto, "projeto">, string> = {
  sem_projeto: "Sem projeto",
  reuniao_interna: "Reunião interna",
  reuniao_externa: "Reunião externa",
};

export function normalizarAlocacaoPonto(selecao?: string | null): {
  projetoId: string | null;
  tipoAlocacao: TipoAlocacaoPonto;
} {
  switch (selecao) {
    case ALOCACAO_REUNIAO_INTERNA:
      return { projetoId: null, tipoAlocacao: "reuniao_interna" };
    case ALOCACAO_REUNIAO_EXTERNA:
      return { projetoId: null, tipoAlocacao: "reuniao_externa" };
    case ALOCACAO_SEM_PROJETO:
    case "":
    case undefined:
    case null:
      return { projetoId: null, tipoAlocacao: "sem_projeto" };
    default:
      return { projetoId: selecao, tipoAlocacao: "projeto" };
  }
}

/** Valor que deve voltar ao seletor para representar a sessão persistida. */
export function selecaoDaAlocacaoPonto(
  projetoId: string | null,
  tipoAlocacao: TipoAlocacaoPonto,
): string {
  if (projetoId) return projetoId;
  switch (tipoAlocacao) {
    case "reuniao_interna":
      return ALOCACAO_REUNIAO_INTERNA;
    case "reuniao_externa":
      return ALOCACAO_REUNIAO_EXTERNA;
    case "projeto":
    case "sem_projeto":
      return ALOCACAO_SEM_PROJETO;
  }
}

export function rotuloAlocacaoSemProjeto(tipoAlocacao: TipoAlocacaoPonto): string {
  return tipoAlocacao === "projeto" ? "Projeto" : ROTULO_TIPO_ALOCACAO[tipoAlocacao];
}
