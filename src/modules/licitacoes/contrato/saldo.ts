type AditivoValor = { valorDelta: number | null };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Soma líquida dos deltas de aditivos (acréscimos − supressões). null = 0. */
export function somaDeltas(aditivos: AditivoValor[]): number {
  return round2(aditivos.reduce((s, a) => s + (a.valorDelta ?? 0), 0));
}

/** Soma apenas dos acréscimos (deltas positivos). */
export function somaAcrescimos(aditivos: AditivoValor[]): number {
  return round2(aditivos.reduce((s, a) => s + Math.max(0, a.valorDelta ?? 0), 0));
}

/** Saldo a medir = (homologado + deltas líquidos) − medido. */
export function saldoContratual(valorHomologado: number, somaDeltasNet: number, somaMedicoes: number): number {
  return round2(valorHomologado + somaDeltasNet - somaMedicoes);
}

/** % de acréscimo acumulado sobre o homologado. Homologado ≤ 0 → 0. */
export function acrescimoAcumuladoPct(valorHomologado: number, somaAcrescimosVal: number): number {
  if (valorHomologado <= 0) return 0;
  return round2((somaAcrescimosVal / valorHomologado) * 100);
}

/** Acréscimo excede o limite legal? */
export function limiteExcedido(acrescimoPct: number, limitePct: number): boolean {
  return acrescimoPct > limitePct;
}

/** Acréscimo já está na zona de aviso (≥ limite × fatorAviso)? */
export function proximoDoLimite(acrescimoPct: number, limitePct: number, fatorAviso: number): boolean {
  return acrescimoPct >= limitePct * fatorAviso;
}
