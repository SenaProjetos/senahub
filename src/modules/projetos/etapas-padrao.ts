/**
 * Etapas com que toda disciplina nasce (áudio do dono, 2026-10-10). Regra pura, sem I/O.
 *
 * Projeto de cliente (particular ou licitação) tem as fases do TIPO DE EMPREENDIMENTO dele, editadas em
 * Configurações → Tipos de empreendimento (`TipoEmpreendimento.etapasPadraoIds`). Tipo sem lista — ou projeto sem
 * tipo — usa o padrão do sistema: Estudo Preliminar, Básico e Executivo. Aprovação e laudo não seguem esse ciclo de
 * projeto: nascem sem etapa, como sempre.
 *
 * As etapas nascem com 0%: o coordenador preenche o percentual (ou o modelo de EAP preenche), e o pagamento por fase
 * fica bloqueado até a soma fechar 100% (`validarPercentuais`).
 */

/** Siglas das fases no catálogo (`PranchaCatalogo`, categoria `fase`, globais) do padrão do sistema. */
export const SIGLA_ESTUDO_PRELIMINAR = "PL";
export const SIGLA_BASICO = "BS";
export const SIGLA_EXECUTIVO = "EX";
export const SIGLAS_PADRAO: readonly string[] = [SIGLA_ESTUDO_PRELIMINAR, SIGLA_BASICO, SIGLA_EXECUTIVO];

export type TipoProjeto = "particular" | "licitacao" | "aprovacao" | "laudo";

export type FaseDoCatalogo = { id: string; sigla: string; ordem: number };

/**
 * Ids das fases em que a disciplina nasce, na ordem do catálogo. Fase escolhida no tipo que saiu do catálogo
 * (arquivada ou apagada) é pulada — a disciplina nasce com as que existem, nunca com erro.
 */
export function fasesParaNascer(p: {
  tipoProjeto: TipoProjeto;
  /** `TipoEmpreendimento.etapasPadraoIds`; vazio ou nulo = o padrão do sistema. */
  idsDoTipo: readonly string[] | null;
  /** Fases globais ATIVAS do catálogo. */
  catalogo: readonly FaseDoCatalogo[];
}): string[] {
  if (p.tipoProjeto !== "particular" && p.tipoProjeto !== "licitacao") return [];
  const escolhidas =
    p.idsDoTipo && p.idsDoTipo.length > 0
      ? new Set(p.idsDoTipo)
      : new Set(p.catalogo.filter((f) => SIGLAS_PADRAO.includes(f.sigla)).map((f) => f.id));
  return p.catalogo
    .filter((f) => escolhidas.has(f.id))
    .sort((a, b) => a.ordem - b.ordem)
    .map((f) => f.id);
}

/** Início depois do fim não existe. Devolve a frase da recusa, ou `null` se vale. */
export function motivoInicioDaEtapa(inicio: string | null, prazo: string | null): string | null {
  if (inicio && prazo && inicio > prazo) return "O início da etapa não pode ser depois do prazo (fim) dela.";
  return null;
}
