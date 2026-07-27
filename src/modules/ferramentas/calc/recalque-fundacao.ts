/**
 * Engine E28 — Recalque de fundação rasa (ELS da NBR 6122). Puro, sem I/O.
 *
 * Quatro modos independentes (union discriminada por `modo`):
 *  - "elastico"    — recalque imediato pela teoria da elasticidade: ρ = q·B·(1−ν²)/Eu·Iw.
 *  - "fatias"      — recalque imediato somando fatias: Δσ por Holl (canto de área carregada,
 *                    ×4 no ponto central) e Es = α·K·N por Teixeira & Godoy (1996).
 *  - "adensamento" — adensamento primário de argila (Terzaghi), corrigido por Skempton–Bjerrum (μ),
 *                    com evolução no tempo por Taylor.
 *  - "secundaria"  — compressão secundária (Cα) e soma do recalque total vs. admissível.
 *
 * Unidades: comprimento/profundidade em m (espessuras de camada em m), força em kN, tensão em kPa.
 * Recalque imediato em **mm**; recalque de adensamento/secundário em **cm** (ordem de grandeza usual).
 *
 * Correlações (Es por SPT, μ de tabela, Iw tabelado) são ESTIMATIVA de anteprojeto: com ensaio
 * (oedométrico, pressiométrico, prova de carga) usar os parâmetros medidos.
 */

import { z } from "zod";
import { camadaSptSchema, type CamadaSpt, type TipoSolo } from "./spt-shared";

/** Coeficientes de Teixeira & Godoy (1996) por tipo de solo: Es = α·K·N (K em MPa). */
const ALFA_K: Record<TipoSolo, { alpha: number; K: number }> = {
  areia: { alpha: 3, K: 0.9 },
  areia_siltosa: { alpha: 3, K: 0.7 },
  areia_argilosa: { alpha: 3, K: 0.55 },
  silte: { alpha: 5, K: 0.35 },
  silte_arenoso: { alpha: 5, K: 0.45 },
  silte_argiloso: { alpha: 5, K: 0.25 },
  argila: { alpha: 7, K: 0.2 },
  argila_arenosa: { alpha: 7, K: 0.3 },
  argila_siltosa: { alpha: 7, K: 0.22 },
};

/** Iw tabelado para sapata rígida: L/B = 1 → 0,86; L/B = 2 → 1,17. */
const IW_LB1 = 0.86;
const IW_LB2 = 1.17;

const SEGUNDOS_ANO = 31_536_000;
const SEGUNDOS_MES = 2_592_000;
const SEGUNDOS_DIA = 86_400;

// ─────────────────────────── modo elastico ───────────────────────────

const elasticoSchema = z.object({
  modo: z.literal("elastico"),
  fz: z.number().positive(), // kN
  bM: z.number().positive(), // m — menor lado
  lM: z.number().positive(), // m — maior lado
  hbM: z.number().positive(), // m — altura da sapata
  apCm: z.number().positive(), // cm — pilar (dir. B)
  lpCm: z.number().positive(), // cm — pilar (dir. L)
  euKpa: z.number().positive(), // kPa — módulo de deformabilidade (não drenado)
  nu: z.number().min(0).max(0.5).default(0.5), // coeficiente de Poisson
});

// ─────────────────────────── modo fatias ───────────────────────────

const fatiasSchema = z.object({
  modo: z.literal("fatias"),
  fz: z.number().positive(), // kN
  bM: z.number().positive(), // m — menor lado (base da discretização)
  lM: z.number().positive(), // m — maior lado
  camadas: z.array(camadaSptSchema).min(1), // perfil abaixo da base da sapata
});

// ─────────────────────────── modo adensamento ───────────────────────────

const adensamentoSchema = z.object({
  modo: z.literal("adensamento"),
  dqKpa: z.number().positive(), // acréscimo de tensão no meio da camada
  hM: z.number().positive(), // espessura da camada de argila (m)
  cc: z.number().positive(), // índice de compressão
  e0: z.number().positive(), // índice de vazios inicial
  sigmaIniKpa: z.number().positive(), // σ' inicial no meio da camada
  mu: z.number().min(0).max(1).default(1), // fator de Skempton–Bjerrum (de tabela)
  cvCm2s: z.number().positive(), // coeficiente de adensamento (cm²/s)
  tDias: z.number().positive().default(30), // instante para o recalque parcial
  /** Dupla = camada drenante em cima e embaixo (Hd = H/2); simples = só de um lado (Hd = H). */
  drenagem: z.enum(["dupla", "simples"]).default("dupla"),
});

// ─────────────────────────── modo secundaria ───────────────────────────

const secundariaSchema = z
  .object({
    modo: z.literal("secundaria"),
    caPct: z.number().positive(), // Cα (%)
    t2Anos: z.number().positive(),
    t1Anos: z.number().positive(), // fim do adensamento primário
    hM: z.number().positive(),
    rhoImediatoCm: z.number().min(0),
    rhoAdensamentoCm: z.number().min(0),
    rhoAdmCm: z.number().positive().default(5),
  })
  .refine((v) => v.t2Anos > v.t1Anos, {
    message: "t2 deve ser posterior a t1 (fim do adensamento primário).",
    path: ["t2Anos"],
  });

export const entradaSchema = z.discriminatedUnion("modo", [
  elasticoSchema,
  fatiasSchema,
  adensamentoSchema,
  secundariaSchema,
]);
export type EntradaRecalque = z.infer<typeof entradaSchema>;
export type EntradaRecalqueInput = z.input<typeof entradaSchema>;

export type ResultadoElastico = {
  modo: "elastico";
  qKpa: number;
  rigida: boolean;
  hMinRigidaCm: number;
  lb: number;
  iw: number;
  recalqueMm: number;
  alertas: string[];
};

export type FatiaRecalque = {
  i: number;
  /** m — profundidade do centro da fatia, abaixo da base. */
  zM: number;
  dzM: number;
  esKpa: number;
  dSigmaKpa: number;
  rhoMm: number;
};

export type ResultadoFatias = {
  modo: "fatias";
  qKpa: number;
  fatias: FatiaRecalque[];
  recalqueMm: number;
  alertas: string[];
};

export type ResultadoAdensamento = {
  modo: "adensamento";
  rhoTeoricoCm: number;
  rhoRealCm: number;
  t100Anos: number;
  t50Meses: number;
  rhoTdiasCm: number;
  /** Grau de adensamento no instante t (0..1). */
  ut: number;
  alertas: string[];
};

export type ResultadoSecundaria = {
  modo: "secundaria";
  rhoSecundariaCm: number;
  rhoTotalCm: number;
  aceitavel: boolean;
  alertas: string[];
};

export type ResultadoRecalque =
  | ResultadoElastico
  | ResultadoFatias
  | ResultadoAdensamento
  | ResultadoSecundaria;

export function calcular(input: EntradaRecalqueInput): ResultadoRecalque {
  const v = entradaSchema.parse(input);
  switch (v.modo) {
    case "elastico":
      return calcularElastico(v);
    case "fatias":
      return calcularFatias(v);
    case "adensamento":
      return calcularAdensamento(v);
    case "secundaria":
      return calcularSecundaria(v);
  }
}

function calcularElastico(v: z.infer<typeof elasticoSchema>): ResultadoElastico {
  const alertas: string[] = [];
  const qKpa = v.fz / (v.bM * v.lM);
  const hMinRigidaCm = Math.max((v.bM * 100 - v.apCm) / 3, (v.lM * 100 - v.lpCm) / 3);
  const rigida = v.hbM * 100 >= hMinRigidaCm;
  if (!rigida) {
    alertas.push(
      "Hb < máx[(B−bp)/3, (L−lp)/3]: sapata flexível — o fator Iw de sapata rígida não se aplica com rigor.",
    );
  }
  const lb = v.lM / v.bM;
  if (lb > 2) alertas.push("L/B > 2: fator de forma Iw extrapolado além da faixa tabelada (0,86–1,17).");
  const iw = IW_LB1 + (lb - 1) * (IW_LB2 - IW_LB1);
  const recalqueMm = ((qKpa * v.bM * (1 - v.nu * v.nu)) / v.euKpa) * iw * 1000;
  return { modo: "elastico", qKpa, rigida, hMinRigidaCm, lb, iw, recalqueMm, alertas };
}

/** Es (kPa) na profundidade `zi` (m) abaixo da base, pela camada que a contém. */
function esNaProfundidade(camadas: CamadaSpt[], zi: number): number {
  let acc = 0;
  for (const c of camadas) {
    acc += c.espessuraM;
    if (zi <= acc + 1e-9) {
      const p = ALFA_K[c.solo];
      return p.alpha * p.K * c.nspt * 1000; // MPa → kPa
    }
  }
  const ultima = camadas[camadas.length - 1];
  const p = ALFA_K[ultima.solo];
  return p.alpha * p.K * ultima.nspt * 1000;
}

/** Espessuras Δz das fatias: 0,25B (z<B), 0,5B (B≤z<2B), 1,0B (z≥2B), somando 6B. */
function gerarFatias(bM: number): number[] {
  const zmax = 6 * bM;
  const dzs: number[] = [];
  let z = 0;
  while (z < zmax - 1e-9) {
    let dz = z < bM ? 0.25 * bM : z < 2 * bM ? 0.5 * bM : 1.0 * bM;
    dz = Math.min(dz, zmax - z);
    dzs.push(dz);
    z += dz;
  }
  return dzs;
}

function calcularFatias(v: z.infer<typeof fatiasSchema>): ResultadoFatias {
  const alertas: string[] = [];
  const qKpa = v.fz / (v.bM * v.lM);
  // Holl: Δσ no canto de uma área a×b; no ponto central da sapata somam-se os 4 quadrantes.
  const a = v.lM / 2;
  const b = v.bM / 2;
  const dzs = gerarFatias(v.bM);
  const fatias: FatiaRecalque[] = [];
  let z = 0;
  let recalqueMm = 0;
  dzs.forEach((dz, idx) => {
    const zi = z + dz / 2; // profundidade do centro da fatia
    z += dz;
    const r1 = Math.hypot(a, zi);
    const r2 = Math.hypot(b, zi);
    const r3 = Math.sqrt(a * a + b * b + zi * zi);
    const dsp =
      (qKpa / (2 * Math.PI)) *
      (Math.atan((a * b) / (zi * r3)) + ((a * b * zi) / r3) * (1 / (r1 * r1) + 1 / (r2 * r2)));
    const dSigmaKpa = 4 * dsp;
    const esKpa = esNaProfundidade(v.camadas, zi);
    const rhoMm = esKpa > 0 ? ((dSigmaKpa * dz) / esKpa) * 1000 : 0;
    recalqueMm += rhoMm;
    fatias.push({ i: idx + 1, zM: zi, dzM: dz, esKpa, dSigmaKpa, rhoMm });
  });
  const somaCamadas = v.camadas.reduce((s, c) => s + c.espessuraM, 0);
  if (somaCamadas < 6 * v.bM) {
    alertas.push(
      `Perfil informado (${somaCamadas.toFixed(1)} m) < 6B (${(6 * v.bM).toFixed(1)} m): as fatias mais ` +
        "profundas usam o Es da última camada — informar sondagem mais profunda.",
    );
  }
  return { modo: "fatias", qKpa, fatias, recalqueMm, alertas };
}

function calcularAdensamento(v: z.infer<typeof adensamentoSchema>): ResultadoAdensamento {
  const alertas: string[] = [];
  const hCm = v.hM * 100;
  const sigmaFinal = v.sigmaIniKpa + v.dqKpa; // σ'f (argila NC → σ'p = σ'i)
  const rhoTeoricoCm = ((v.cc * hCm) / (1 + v.e0)) * Math.log10(sigmaFinal / v.sigmaIniKpa);
  const rhoRealCm = v.mu * rhoTeoricoCm;
  alertas.push(
    "μ (Skempton–Bjerrum) é obtido de tabela em função de A e H/B — informado como entrada, não recalculado.",
  );
  alertas.push("Cálculo para argila normalmente adensada (σ'p = σ'i); pré-adensada exige o trecho de recompressão (Cr).");

  const hd = v.drenagem === "dupla" ? hCm / 2 : hCm; // distância de drenagem (cm)
  const t100 = (2.0 * hd * hd) / v.cvCm2s; // s (Tv = 2,0 → U ≈ 99,9%)
  const t100Anos = t100 / SEGUNDOS_ANO;
  const tv50 = (Math.PI / 4) * 0.25; // Taylor, U = 0,5
  const t50Meses = ((tv50 * hd * hd) / v.cvCm2s) / SEGUNDOS_MES;

  const tv = (v.cvCm2s * (v.tDias * SEGUNDOS_DIA)) / (hd * hd);
  const ut = Math.min(Math.sqrt((4 * tv) / Math.PI), 1); // Taylor (válido U ≤ 0,6; capado em 1)
  const rhoTdiasCm = ut * rhoRealCm;
  if (ut > 0.6) alertas.push("U(t) > 60%: a aproximação de Taylor T = (π/4)·U² perde precisão nessa faixa.");
  return { modo: "adensamento", rhoTeoricoCm, rhoRealCm, t100Anos, t50Meses, rhoTdiasCm, ut, alertas };
}

function calcularSecundaria(v: z.infer<typeof secundariaSchema>): ResultadoSecundaria {
  const alertas: string[] = [];
  const hCm = v.hM * 100;
  const rhoSecundariaCm = (v.caPct / 100) * Math.log10(v.t2Anos / v.t1Anos) * hCm;
  const rhoTotalCm = v.rhoImediatoCm + v.rhoAdensamentoCm + rhoSecundariaCm;
  const aceitavel = rhoTotalCm <= v.rhoAdmCm;
  if (!aceitavel) {
    alertas.push(
      "Recalque total > admissível: considerar fundação profunda (estacas/tubulões) atravessando a argila mole, " +
        "melhoria/tratamento do solo (pré-carregamento com drenos, colunas granulares) ou redistribuição de cargas.",
    );
  }
  return { modo: "secundaria", rhoSecundariaCm, rhoTotalCm, aceitavel, alertas };
}
