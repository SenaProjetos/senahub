/**
 * Agendamento de avisos gerais (envio programado).
 * Módulo PURO (sem server-only/prisma): a janela válida e o status derivado são
 * testáveis isoladamente e a UI cliente pode importar o mesmo cálculo do servidor.
 *
 * Diferente do chat (`modules/chat/agendamento.ts`), o disparo NÃO usa
 * `boss.send({startAfter})`: o aviso é persistido com `agendadoPara` e um tick
 * do pg-boss varre os vencidos. Assim o comunicado é visível e cancelável antes
 * da hora — o que uma mensagem de chat "solta na fila" não permite.
 */

const UM_MINUTO = 60_000;
const NOVENTA_DIAS = 90 * 24 * 60 * 60 * 1000;

export type ResultadoAgendamento = { ok: true; date: Date } | { ok: false; erro: string };

/** Valida a data escolhida: pelo menos 1 min à frente e no máximo 90 dias. */
export function validarAgendamentoAviso(
  quandoISO: string,
  agora: Date = new Date(),
): ResultadoAgendamento {
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

export type StatusAviso = "enviado" | "agendado" | "cancelado";

/** Status derivado do ciclo de vida (cancelado vence agendado; enviado é final). */
export function statusAviso(a: {
  enviadoEm?: Date | string | null;
  canceladoEm?: Date | string | null;
}): StatusAviso {
  if (a.enviadoEm) return "enviado";
  if (a.canceladoEm) return "cancelado";
  return "agendado";
}

export const STATUS_AVISO_LABEL: Record<StatusAviso, string> = {
  enviado: "Enviado",
  agendado: "Agendado",
  cancelado: "Cancelado",
};
