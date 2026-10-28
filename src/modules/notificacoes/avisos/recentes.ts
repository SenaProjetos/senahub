/**
 * Regra do ponto do atalho de Avisos (puro, sem I/O): acende quando chegou um aviso nos últimos
 * dias e a pessoa ainda não passou pela tela de Avisos depois dele.
 */

export const JANELA_AVISO_RECENTE_DIAS = 3;

const DIA_MS = 24 * 60 * 60 * 1000;

export function avisoRecenteNaoVisto(
  recebidoEm: string | Date | null,
  ultimaVisitaMs: number | null,
  agora: Date,
): boolean {
  if (recebidoEm === null || recebidoEm === undefined) return false;
  const recebidoMs = new Date(recebidoEm).getTime();
  if (!Number.isFinite(recebidoMs)) return false;

  const agoraMs = agora.getTime();
  if (recebidoMs > agoraMs + DIA_MS) return false;
  if (agoraMs - recebidoMs > JANELA_AVISO_RECENTE_DIAS * DIA_MS) return false;

  return ultimaVisitaMs === null || recebidoMs > ultimaVisitaMs;
}
