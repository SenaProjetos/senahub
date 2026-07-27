/**
 * Regras puras do cadastro de ARTs (Anotação/Registro de Responsabilidade Técnica).
 * Sem I/O, sem Prisma — client-safe, usado pela UI (rótulos/validação) e pelas actions.
 */

/** Documentos de responsabilidade técnica por conselho. */
export const TIPOS_ART = [
  { valor: "ART", label: "ART (CREA)" },
  { valor: "RRT", label: "RRT (CAU)" },
  { valor: "TRT", label: "TRT (CFT)" },
] as const;
export type TipoArt = (typeof TIPOS_ART)[number]["valor"];

/**
 * Situações do documento. `substituida` é atribuída automaticamente à versão anterior
 * quando uma nova versão é registrada — não é escolha do usuário.
 */
export const SITUACOES_ART = [
  { valor: "rascunho", label: "Rascunho" },
  { valor: "registrada", label: "Registrada" },
  { valor: "baixada", label: "Baixada" },
  { valor: "cancelada", label: "Cancelada" },
  { valor: "substituida", label: "Substituída" },
] as const;
export type SituacaoArt = (typeof SITUACOES_ART)[number]["valor"];

export const LABEL_SITUACAO_ART: Record<string, string> = Object.fromEntries(
  SITUACOES_ART.map((s) => [s.valor, s.label]),
);

/** Próximo número de versão (sequencial por ART, começando em 1). */
export function proximoNumeroVersao(versoes: readonly { numero: number }[]): number {
  return versoes.reduce((max, v) => Math.max(max, v.numero), 0) + 1;
}

/**
 * ART encerrada (cancelada/baixada) não recebe nova versão: o caminho correto é
 * cadastrar uma ART nova, senão o histórico mente sobre o que estava vigente.
 */
export function podeReceberNovaVersao(situacao: string): boolean {
  return situacao !== "cancelada" && situacao !== "baixada";
}

/** Rótulo curto do documento: `"ART 123456"`. */
export function rotuloArt(art: { tipo: string; numero: string }): string {
  return `${art.tipo} ${art.numero}`.trim();
}
