/** Dois intervalos de data se sobrepõem? Datas "YYYY-MM-DD"; null = aberto (sem limite). */
export function intervalosSobrepoem(
  aIni: string | null,
  aFim: string | null,
  bIni: string | null,
  bFim: string | null,
): boolean {
  // a começa depois do fim de b? sem overlap. b começa depois do fim de a? sem overlap.
  if (aIni && bFim && aIni > bFim) return false;
  if (bIni && aFim && bIni > aFim) return false;
  return true;
}

/** Soma de subcontratação excede o teto? teto null = sem teto (nunca excede). */
export function excedeTetoSubcontratacao(
  somaAtual: number,
  novo: number,
  teto: number | null,
): boolean {
  if (teto == null) return false;
  return Math.round((somaAtual + novo) * 100) / 100 > teto;
}
