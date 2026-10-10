/**
 * Etapas com que toda disciplina nasce (áudio do dono, 2026-10-10). Regra pura, sem I/O.
 *
 * Projeto de cliente (particular ou licitação) tem Estudo Preliminar, Básico e Executivo; o tipo de
 * empreendimento marcado `semEstudoPreliminar` (Residencial unifamiliar) só Básico e Executivo.
 * Aprovação e laudo não seguem esse ciclo de projeto — nascem sem etapa, como sempre.
 *
 * As etapas nascem com 0%: o coordenador preenche o percentual, e o pagamento por fase fica
 * bloqueado até a soma fechar 100% (`validarPercentuais`).
 */

/** Siglas das fases no catálogo (`PranchaCatalogo`, categoria `fase`, globais). */
export const SIGLA_ESTUDO_PRELIMINAR = "PL";
export const SIGLA_BASICO = "BS";
export const SIGLA_EXECUTIVO = "EX";

export type TipoProjeto = "particular" | "licitacao" | "aprovacao" | "laudo";

export function etapasPadrao(p: { tipoProjeto: TipoProjeto; semEstudoPreliminar: boolean }): string[] {
  if (p.tipoProjeto !== "particular" && p.tipoProjeto !== "licitacao") return [];
  return p.semEstudoPreliminar ? [SIGLA_BASICO, SIGLA_EXECUTIVO] : [SIGLA_ESTUDO_PRELIMINAR, SIGLA_BASICO, SIGLA_EXECUTIVO];
}

/** Início depois do fim não existe. Devolve a frase da recusa, ou `null` se vale. */
export function motivoInicioDaEtapa(inicio: string | null, prazo: string | null): string | null {
  if (inicio && prazo && inicio > prazo) return "O início da etapa não pode ser depois do prazo (fim) dela.";
  return null;
}
