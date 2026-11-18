/**
 * Quem pode decidir, lançar ou responder alteração de férias (puro, client-safe). A regra de
 * quem decide é a mesma do abono (`quem-decide.ts`): as próprias férias e as de quem é do RH só um
 * administrador (superusuário) decide.
 */
import { bloqueioDeDecisao } from "./quem-decide";

/**
 * Teto de UM período de férias: 30 dias corridos (CLT art. 130; o recesso do estágio também é de 30
 * dias, Lei 11.788 art. 13). Períodos vencidos acumulados entram como períodos separados.
 */
export const MAX_DIAS_FERIAS = 30;
export const MOTIVO_FIM_ANTES_DO_INICIO = "A data de fim não pode ser anterior ao início.";

const DIA_MS = 86_400_000;

/** Dias corridos de `inicio` a `fim` (`YYYY-MM-DD`, os dois inclusos). Data ilegível = `NaN`. */
export function diasCorridosFerias(inicio: string, fim: string): number {
  return Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / DIA_MS) + 1;
}

/**
 * Por que o período de férias não vale (`null` = vale): fim antes do início, ou mais de
 * `MAX_DIAS_FERIAS` dias corridos. A mesma frase na tela (antes de enviar) e no servidor (schema).
 * `quem`: quem digita as datas (padrão) ou quem só decide um pedido/proposta já gravado antes do
 * teto — esse não muda as datas, então a frase manda recusar.
 */
export function motivoPeriodoFerias(
  inicio: string,
  fim: string,
  quem: "digita" | "decide" = "digita",
): string | null {
  if (fim < inicio) return MOTIVO_FIM_ANTES_DO_INICIO;
  const dias = diasCorridosFerias(inicio, fim);
  if (dias > MAX_DIAS_FERIAS) {
    return quem === "decide"
      ? `Este período tem ${dias} dias corridos, acima do máximo de ${MAX_DIAS_FERIAS}. Recuse e peça um período de até ${MAX_DIAS_FERIAS} dias.`
      : `Um período de férias tem no máximo ${MAX_DIAS_FERIAS} dias corridos (este tem ${dias}). Para mais dias, lance outro período em seguida.`;
  }
  return null;
}

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
