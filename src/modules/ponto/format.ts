/** Helpers puros de ponto (usáveis no cliente — sem prisma/server-only). */

export function minutosSessao(inicio: Date, fim: Date | null): number {
  const f = fim ?? new Date();
  return Math.max(0, Math.round((f.getTime() - inicio.getTime()) / 60000));
}

export function fmtHoras(min: number): string {
  const sinal = min < 0 ? "-" : "";
  const a = Math.abs(min);
  return `${sinal}${Math.floor(a / 60)}h${String(a % 60).padStart(2, "0")}`;
}
