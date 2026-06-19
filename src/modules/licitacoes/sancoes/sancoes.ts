/** Sanção ativa na data de referência? inicio/fim "YYYY-MM-DD"; null = aberto. */
export function sancaoAtiva(s: { inicio: string | null; fim: string | null }, hojeISO: string): boolean {
  if (s.inicio && s.inicio > hojeISO) return false; // ainda não começou
  if (s.fim && s.fim < hojeISO) return false;        // já terminou
  return true;
}
