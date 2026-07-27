/**
 * Perfil de sondagem SPT compartilhado pelas calculadoras de fundação
 * (estaca-spt, sapata-spt, recalque-fundacao). Puro, sem I/O.
 *
 * Enquanto o mesmo furo não precisar ser reusado entre calculadoras de um projeto,
 * `camadas[]` vive nas entradas de cada cálculo — não há modelo Prisma de sondagem.
 */

import { z } from "zod";

/** Tabela de solos: Aoki (K em kPa, α em %) e Décourt (C em kPa, para a ponta). */
export const SOLOS = {
  areia: { label: "Areia", K: 1000, alpha: 1.4, C: 400 },
  areia_siltosa: { label: "Areia siltosa", K: 800, alpha: 2.0, C: 400 },
  areia_argilosa: { label: "Areia argilosa", K: 600, alpha: 3.0, C: 400 },
  silte: { label: "Silte", K: 400, alpha: 3.0, C: 200 },
  silte_arenoso: { label: "Silte arenoso", K: 550, alpha: 2.2, C: 250 },
  silte_argiloso: { label: "Silte argiloso", K: 230, alpha: 3.4, C: 200 },
  argila: { label: "Argila", K: 200, alpha: 6.0, C: 120 },
  argila_arenosa: { label: "Argila arenosa", K: 350, alpha: 2.4, C: 120 },
  argila_siltosa: { label: "Argila siltosa", K: 220, alpha: 4.0, C: 120 },
} as const;
export type TipoSolo = keyof typeof SOLOS;

/** Uma camada do perfil: tipo de solo, N do SPT e espessura em metros. */
export const camadaSptSchema = z.object({
  solo: z.enum(Object.keys(SOLOS) as [TipoSolo, ...TipoSolo[]]),
  nspt: z.number().min(0),
  espessuraM: z.number().positive(),
});
export type CamadaSpt = z.infer<typeof camadaSptSchema>;

/** N médio ponderado pela espessura das camadas (0 para perfil vazio). */
export function nMedioPonderado(camadas: readonly CamadaSpt[]): number {
  const h = camadas.reduce((s, c) => s + c.espessuraM, 0);
  return h > 0 ? camadas.reduce((s, c) => s + c.nspt * c.espessuraM, 0) / h : 0;
}

/**
 * Recorta o perfil até `limiteM` metros a partir do topo, fatiando a camada de borda.
 * Usado para isolar o trecho dentro do bulbo de tensões / da camada compressível.
 */
export function camadasAteProfundidade(camadas: readonly CamadaSpt[], limiteM: number): CamadaSpt[] {
  const out: CamadaSpt[] = [];
  let acc = 0;
  for (const c of camadas) {
    if (acc >= limiteM) break;
    out.push({ ...c, espessuraM: Math.min(c.espessuraM, limiteM - acc) });
    acc += c.espessuraM;
  }
  return out;
}
