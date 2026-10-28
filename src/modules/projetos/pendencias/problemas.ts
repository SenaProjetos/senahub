/**
 * Regras puras da aba "Problemas" do projeto e da conversa de uma pendência.
 * Puro: sem Prisma, sem server-only, sem Next — a tela e o servidor usam as mesmas regras.
 */

/** Frase que o servidor lança quando quem não participa tenta agir na pendência. */
export const MOTIVO_NAO_PARTICIPA = "Só um responsável da disciplina pode alterar esta pendência.";

/**
 * Participante da conversa de um apontamento: o autor dele, um responsável da disciplina
 * ou o perfil global (atua em disciplina alheia). Mais largo que o gate de quem aponta
 * (`uploads:validar`) de propósito: o projetista é o outro lado da conversa.
 */
export function podeParticiparDaConversa(a: {
  autorId: string;
  usuarioId: string;
  ehResponsavel: boolean;
  ehGlobal: boolean;
}): boolean {
  return a.autorId === a.usuarioId || a.ehResponsavel || a.ehGlobal;
}
