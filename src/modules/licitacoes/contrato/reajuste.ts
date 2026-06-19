const round2 = (n: number) => Math.round(n * 100) / 100;

/** Valor após aplicar `percentual`% sobre `valorBase`, arredondado a centavos. */
export function valorReajustado(valorBase: number, percentual: number): number {
  return round2(valorBase * (1 + percentual / 100));
}

/** `hojeISO` é aniversário anual de `vigenciaInicioISO`? (mesmo mês/dia, em ano posterior).
 *  Timezone-safe: parse de "YYYY-MM-DD" por componentes. */
export function ehAniversarioReajuste(vigenciaInicioISO: string, hojeISO: string): boolean {
  const [iy, im, idd] = vigenciaInicioISO.split("-").map(Number);
  const [hy, hm, hd] = hojeISO.split("-").map(Number);
  if (!iy || !hy) return false;
  if (hy <= iy) return false;        // precisa ser pelo menos o ano seguinte
  return hm === im && hd === idd;
}
