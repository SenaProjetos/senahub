/**
 * Por que um dia TRABALHADO não tem horas devidas — PURO (sem I/O, client-safe).
 *
 * Num dia com batidas o status do espelho é "OK"/"Ajustado", e o motivo de as
 * devidas virem zeradas (o que faz TODO o trabalhado virar extra) ficava
 * invisível: parecia erro de cálculo. Esta função devolve o motivo na MESMA
 * ordem de `esperado.minutosDoDia`, para a tela dizer o que o cálculo fez.
 *
 * Dia sem batidas já tem o motivo no próprio status (Feriado, Férias, Folga…),
 * e quem não tem jornada controlada não tem devidas nem extras — nos dois casos
 * não há o que explicar (`null`).
 */

export type MotivoSemJornada =
  | "antes_vinculo"
  | "depois_vinculo"
  | "feriado"
  | "ferias"
  | "abonado"
  | "folga";

export type EntradaMotivoSemJornada = {
  dia: string; // YYYY-MM-DD
  temBatidas: boolean;
  controlaJornada: boolean;
  /** Minutos devidos no dia (`esperadoPorDia`). */
  devidasMin: number;
  /** Primeiro / último dia apurável (`contextoApuracao`). */
  piso: string | null;
  teto: string | null;
  feriado: boolean;
  ferias: boolean;
  /** Abono de dia inteiro com tratamento `abonar`. */
  abonoInteiro: boolean;
  gradeAtiva: boolean;
};

export function motivoSemJornada(e: EntradaMotivoSemJornada): MotivoSemJornada | null {
  if (!e.temBatidas || !e.controlaJornada || e.devidasMin > 0) return null;
  if (e.piso && e.dia < e.piso) return "antes_vinculo";
  if (e.teto && e.dia > e.teto) return "depois_vinculo";
  if (e.feriado) return "feriado";
  if (e.ferias) return "ferias";
  if (e.abonoInteiro) return "abonado";
  if (!e.gradeAtiva) return "folga";
  return null;
}
