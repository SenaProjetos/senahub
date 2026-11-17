/**
 * Quem pode decidir, lançar ou responder alteração de férias (puro, client-safe). A regra de
 * quem decide é a mesma do abono (`quem-decide.ts`): as próprias férias e as de quem é do RH só um
 * administrador (superusuário) decide.
 */
import { bloqueioDeDecisao } from "./quem-decide";

/** Mesma frase na action e no toast: dois cliques (ou duas abas) decidindo as mesmas férias. */
export const MOTIVO_FERIAS_JA_DECIDIDAS = "Estas férias já foram decididas. Atualize a página.";
/** Mesmas frases na action e na fila do RH (no lugar dos botões). */
export const MOTIVO_PROPRIAS_FERIAS = "São as suas próprias férias: um administrador decide.";
export const MOTIVO_FERIAS_DE_RH = "Férias de quem é do RH: só um administrador decide.";

type Quem = { id: string; superUsuario: boolean };

/** Por que `quem` NÃO pode decidir férias deste dono — sem olhar status (`null` = pode). */
export function motivoParaNaoDecidirFeriasDe(dono: { id: string; ehRh: boolean }, quem: Quem): string | null {
  const bloqueio = bloqueioDeDecisao(dono, quem);
  if (bloqueio === "propria") return MOTIVO_PROPRIAS_FERIAS;
  if (bloqueio === "de_rh") return MOTIVO_FERIAS_DE_RH;
  return null;
}

/** Por que `quem` NÃO pode aprovar/rejeitar esta solicitação de férias (`null` = pode). */
export function motivoParaNaoDecidirFerias(
  ferias: { status: string; userId: string; donoEhRh: boolean },
  quem: Quem,
): string | null {
  if (ferias.status !== "pendente") return MOTIVO_FERIAS_JA_DECIDIDAS;
  return motivoParaNaoDecidirFeriasDe({ id: ferias.userId, ehRh: ferias.donoEhRh }, quem);
}

/**
 * Por que `autor` NÃO pode lançar férias (já aprovadas) para o alvo (`null` = pode). Lançar é
 * decidir: as próprias e as de quem é do RH passam pela solicitação, que um administrador aprova.
 */
export function motivoParaNaoLancarFeriasPara(alvo: { id: string; ehRh: boolean }, autor: Quem): string | null {
  const bloqueio = bloqueioDeDecisao(alvo, autor);
  if (bloqueio === "propria") {
    return "Para as suas próprias férias, use a solicitação em RH: um administrador aprova.";
  }
  if (bloqueio === "de_rh") return "Para quem é do RH, só um administrador lança férias.";
  return null;
}

/** Quem esbarra em férias já registradas no mesmo período. */
export type ContextoFeriasSobrepostas = "propria" | "lancar" | "aprovar" | "alterar";

/**
 * Frase da recusa quando o período cruza outras férias da pessoa (com o status delas). Duas
 * férias aprovadas nos mesmos dias gastariam o período aquisitivo duas vezes; a pendente é
 * decidida antes, na fila. Férias por cima de uma ausência já aprovada passam: o dia não é
 * devido de nenhum jeito e uma ausência aprovada não se desfaz.
 */
export function motivoFeriasSobrepostas(status: string, contexto: ContextoFeriasSobrepostas): string {
  if (contexto === "propria") {
    return status === "pendente"
      ? "Você já pediu férias nesse período, que aguardam decisão."
      : "Você já tem férias aprovadas nesse período.";
  }
  if (contexto === "aprovar") {
    return "Já existem férias aprovadas desta pessoa nesse período. Rejeite esta solicitação para os dias não contarem duas vezes.";
  }
  if (contexto === "alterar") {
    return status === "pendente"
      ? "A nova data cruza uma solicitação de férias pendente desta pessoa. Decida-a antes."
      : "A nova data cruza outras férias aprovadas desta pessoa.";
  }
  return status === "pendente"
    ? "Já existe uma solicitação de férias pendente desta pessoa nesse período. Decida-a em Férias pendentes."
    : "Já existem férias aprovadas desta pessoa nesse período.";
}
