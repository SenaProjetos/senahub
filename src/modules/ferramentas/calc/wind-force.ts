/**
 * Engine E13 — Forças devidas ao vento (NBR 6123:1988).
 * Puro. Velocidades em m/s, pressão em N/m² (e kN/m²), forças em kN, dimensões em m.
 *
 * Vk = V0·S1·S2·S3 ; q = 0,613·Vk² (N/m²) ; F = Ca·q·Ae (força de arrasto global).
 *
 * S2 = b·Fr·(z/10)^p, com b, Fr, p da Tabela 1 (categoria I–V × classe A/B/C). Fr é sempre o
 * valor da categoria II (item 5.3.3).  S3 da Tabela 3 (grupos 1–5).
 *
 * Decisões/limites:
 * - S1 é informado pelo usuário (1,0 plano · 0,9 vale; taludes/morros calculados conforme 5.2).
 * - Ca (coeficiente de arrasto) é informado pelo usuário, lido das Figuras 4/5 (vento de baixa/alta
 *   turbulência) em função de h/l1 e l1/l2 — o ábaco não é reproduzido aqui.
 * - q é avaliado na cota z (use o topo da edificação para a força global, a favor da segurança).
 */

import { z } from "zod";

/** Tabela 1 — parâmetros b e p por categoria (I–V) e classe (A/B/C). */
const PARAMS_S2 = {
  I: { A: { b: 1.1, p: 0.06 }, B: { b: 1.11, p: 0.065 }, C: { b: 1.12, p: 0.07 } },
  II: { A: { b: 1.0, p: 0.085 }, B: { b: 1.0, p: 0.09 }, C: { b: 1.0, p: 0.1 } },
  III: { A: { b: 0.94, p: 0.1 }, B: { b: 0.94, p: 0.105 }, C: { b: 0.93, p: 0.115 } },
  IV: { A: { b: 0.86, p: 0.12 }, B: { b: 0.85, p: 0.125 }, C: { b: 0.84, p: 0.135 } },
  V: { A: { b: 0.74, p: 0.15 }, B: { b: 0.73, p: 0.16 }, C: { b: 0.71, p: 0.175 } },
} as const;

/** Fr — fator de rajada, sempre o da categoria II por classe (item 5.3.3). */
const FR = { A: 1.0, B: 0.98, C: 0.95 } as const;

/** Tabela 3 — fator estatístico S3 por grupo. */
export const GRUPOS_S3 = {
  "1": { valor: 1.1, label: "Grupo 1 — segurança/socorro (hospitais, quartéis, comunicações)" },
  "2": { valor: 1.0, label: "Grupo 2 — hotéis, residências, comércio, indústria (alta ocupação)" },
  "3": { valor: 0.95, label: "Grupo 3 — baixa ocupação (depósitos, silos, rurais)" },
  "4": { valor: 0.88, label: "Grupo 4 — vedações (telhas, vidros, painéis)" },
  "5": { valor: 0.83, label: "Grupo 5 — temporárias / em construção" },
} as const;

export const CATEGORIAS = {
  I: "I — superfícies lisas (mar, lagos, pântanos)",
  II: "II — terreno aberto, poucos obstáculos (cota ~1 m)",
  III: "III — plano/ondulado com obstáculos baixos esparsos (cota ~3 m)",
  IV: "IV — obstáculos numerosos (zona urbana, industrial, florestal; cota ~10 m)",
  V: "V — obstáculos grandes e altos (centro de grandes cidades; cota ≥ 25 m)",
} as const;

export const CLASSES = {
  A: "A — maior dimensão ≤ 20 m",
  B: "B — maior dimensão entre 20 m e 50 m",
  C: "C — maior dimensão > 50 m",
} as const;

export const entradaSchema = z.object({
  v0: z.number().positive(), // m/s — velocidade básica (isopletas)
  s1: z.number().positive().default(1.0), // fator topográfico
  categoria: z.enum(["I", "II", "III", "IV", "V"]).default("II"),
  classe: z.enum(["A", "B", "C"]).default("B"),
  z: z.number().positive(), // m — cota de referência para q
  grupoS3: z.enum(["1", "2", "3", "4", "5"]).default("2"),
  // Força de arrasto (opcional — preenche quando l1, h e ca informados):
  l1: z.number().positive().optional(), // m — largura frontal (perpendicular ao vento)
  l2: z.number().positive().optional(), // m — profundidade (paralela ao vento)
  h: z.number().positive().optional(), // m — altura total da edificação
  ca: z.number().positive().optional(), // coeficiente de arrasto (Figuras 4/5)
});

export type EntradaVento = z.infer<typeof entradaSchema>;
export type EntradaVentoInput = z.input<typeof entradaSchema>;

export type ResultadoVento = {
  s1: number;
  s2: number;
  s3: number;
  b: number;
  fr: number;
  p: number;
  vk: number; // m/s
  q: number; // N/m²
  qkN: number; // kN/m²
  forca: null | {
    ae: number; // m² — área frontal efetiva (l1 · h)
    ca: number;
    f: number; // kN — força de arrasto
    razaoHL1: number; // h / l1
    razaoL1L2: number | null; // l1 / l2 (null se l2 não informado)
  };
};

export function calcular(input: EntradaVentoInput): ResultadoVento {
  const v = entradaSchema.parse(input);

  const { b, p } = PARAMS_S2[v.categoria][v.classe];
  const fr = FR[v.classe];
  const s2 = b * fr * Math.pow(v.z / 10, p);
  const s3 = GRUPOS_S3[v.grupoS3].valor;

  const vk = v.v0 * v.s1 * s2 * s3;
  const q = 0.613 * vk * vk; // N/m²
  const qkN = q / 1000;

  let forca: ResultadoVento["forca"] = null;
  if (v.l1 != null && v.h != null && v.ca != null) {
    const ae = v.l1 * v.h;
    const f = (v.ca * q * ae) / 1000; // kN
    forca = {
      ae,
      ca: v.ca,
      f,
      razaoHL1: v.h / v.l1,
      razaoL1L2: v.l2 != null ? v.l1 / v.l2 : null,
    };
  }

  return { s1: v.s1, s2, s3, b, fr, p, vk, q, qkN, forca };
}
