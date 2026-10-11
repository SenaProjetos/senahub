/**
 * Custo das horas de um projeto (R3, decisão 18 do spec 2026-09-15): o congelado dos meses fechados
 * mais a estimativa dos meses ainda abertos — antes eles valiam zero. PURO, em centavos.
 */
export function custoHorasDoProjeto(p: { fechadasCent: number; abertosCent: Record<string, number> }): {
  fechadasCent: number;
  estimativaCent: number;
  mesesEstimados: string[];
  totalCent: number;
} {
  const meses = Object.keys(p.abertosCent).filter((m) => p.abertosCent[m] !== 0).sort();
  const estimativaCent = meses.reduce((s, m) => s + p.abertosCent[m], 0);
  return { fechadasCent: p.fechadasCent, estimativaCent, mesesEstimados: meses, totalCent: p.fechadasCent + estimativaCent };
}
