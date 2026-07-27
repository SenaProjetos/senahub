/**
 * Engine E23 — Capacidade de estaca por SPT: Aoki-Velloso (1975) e Décourt-Quaresma (1978/1996).
 * Puro. Comprimentos em m, forças em kN, tensões em kPa.
 *
 * Simplificações documentadas: N de ponta = N da camada da ponta (sem a média de 3 valores do
 * Décourt); atrito do Décourt usa N médio ponderado pela espessura. Coeficientes conforme literatura
 * clássica — DEVEM ser conferidos pelo engenheiro geotécnico contra o relatório de sondagem.
 */

import { z } from "zod";
import { SOLOS, camadaSptSchema, nMedioPonderado } from "./spt-shared";

// Perfil de solo (tabela + schema de camada) é compartilhado com as demais calculadoras de fundação.
export { SOLOS };
export type { TipoSolo, CamadaSpt } from "./spt-shared";

/** Fatores F1/F2 do Aoki-Velloso por tipo de estaca. */
export const ESTACAS = {
  pre_moldada: { label: "Pré-moldada", F1: 1.75, F2: 3.5 },
  metalica: { label: "Metálica", F1: 1.75, F2: 3.5 },
  franki: { label: "Franki", F1: 2.5, F2: 5.0 },
  escavada: { label: "Escavada", F1: 3.0, F2: 6.0 },
} as const;
export type TipoEstaca = keyof typeof ESTACAS;

export const entradaSchema = z.object({
  estaca: z.enum(["pre_moldada", "metalica", "franki", "escavada"]),
  diametroCm: z.number().positive(),
  camadas: z.array(camadaSptSchema).min(1),
});

export type EntradaEstaca = z.infer<typeof entradaSchema>;
export type EntradaEstacaInput = z.input<typeof entradaSchema>;

export type ResultadoEstaca = {
  ap: number; // m² (área de ponta)
  u: number; // m (perímetro)
  comprimento: number; // m
  aoki: { rp: number; rl: number; rult: number; radm: number };
  decourt: { rp: number; rl: number; radm: number };
};

export function calcular(input: EntradaEstacaInput): ResultadoEstaca {
  const v = entradaSchema.parse(input);
  const raio = v.diametroCm / 100 / 2; // m
  const ap = Math.PI * raio * raio;
  const u = Math.PI * (v.diametroCm / 100);
  const comprimento = v.camadas.reduce((s, c) => s + c.espessuraM, 0);
  const { F1, F2 } = ESTACAS[v.estaca];

  const camadaPonta = v.camadas[v.camadas.length - 1];
  const soloPonta = SOLOS[camadaPonta.solo];

  // ── Aoki-Velloso ──
  const rpAoki = ((soloPonta.K * camadaPonta.nspt) / F1) * ap; // kN
  let rlAoki = 0;
  for (const c of v.camadas) {
    const s = SOLOS[c.solo];
    const rl = ((s.alpha / 100) * s.K * c.nspt) / F2; // kPa
    rlAoki += rl * u * c.espessuraM; // kN
  }
  const rultAoki = rpAoki + rlAoki;
  const radmAoki = rultAoki / 2;

  // ── Décourt-Quaresma ──
  const rpDecourt = soloPonta.C * camadaPonta.nspt * ap; // kN
  const nMedio = nMedioPonderado(v.camadas);
  const ql = 10 * (nMedio / 3 + 1); // kPa
  const rlDecourt = ql * u * comprimento; // kN
  const radmDecourt = rpDecourt / 4 + rlDecourt / 1.3;

  return {
    ap,
    u,
    comprimento,
    aoki: { rp: rpAoki, rl: rlAoki, rult: rultAoki, radm: radmAoki },
    decourt: { rp: rpDecourt, rl: rlDecourt, radm: radmDecourt },
  };
}
