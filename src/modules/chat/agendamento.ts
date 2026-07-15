/**
 * Agendamento de mensagens do chat (envio programado via pg-boss).
 * Módulo puro (sem server-only/prisma) — o nome da fila é compartilhado entre a
 * Server Action (que enfileira) e o worker em `lib/jobs.ts` (que consome), e a
 * validação da janela é testável isoladamente.
 */

export const FILA_MENSAGEM_AGENDADA = "chat-mensagem-agendada";

/** Payload do job de mensagem agendada. */
export type MensagemAgendadaJob = {
  canalId: string;
  autorId: string;
  conteudo: string;
};

const UM_MINUTO = 60_000;
const NOVENTA_DIAS = 90 * 24 * 60 * 60 * 1000;

export type ResultadoAgendamento =
  | { ok: true; date: Date }
  | { ok: false; erro: string };

/** Valida a data escolhida: pelo menos 1 min à frente e no máximo 90 dias. */
export function validarAgendamento(quandoISO: string, agora: Date = new Date()): ResultadoAgendamento {
  const d = new Date(quandoISO);
  if (Number.isNaN(d.getTime())) return { ok: false, erro: "Data inválida." };
  if (d.getTime() < agora.getTime() + UM_MINUTO) {
    return { ok: false, erro: "Escolha um horário pelo menos 1 minuto no futuro." };
  }
  if (d.getTime() > agora.getTime() + NOVENTA_DIAS) {
    return { ok: false, erro: "O agendamento não pode passar de 90 dias." };
  }
  return { ok: true, date: d };
}
