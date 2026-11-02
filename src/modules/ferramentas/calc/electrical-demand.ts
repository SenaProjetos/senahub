/**
 * Engine E01 — Corrente de projeto, corrente corrigida e carga demandada (NBR 5410).
 * Puro. Potências em W, tensões em V, correntes em A.
 *
 * Por linha de carga:
 *   P_abs = qtd × P / η                 (potência elétrica absorvida)
 *   S     = P_abs / fp                  (potência aparente)
 *   Ib    = P_abs / (k · V · fp)        k = 1 (monofásico) ou √3 (trifásico)
 *   Ib'   = Ib / (FCT · FCA)            (corrente corrigida: a comparar com a capacidade de condução)
 *   P_dem = P_abs × fd                  (carga demandada)
 *
 * AGUARDA VALIDAÇÃO DO ENGENHEIRO (ver docs/engenharia/validacao/corrente-demanda.md):
 * - FCT da Tabela 40 (base 30 °C) e FCA da Tabela 42 (condutores em feixe / conduto fechado);
 * - a soma da demanda em kVA é aritmética (a favor da segurança); a soma vetorial exigiria ângulos;
 * - fatores de demanda NÃO são da NBR 5410: vêm da concessionária e são digitados por linha.
 */

import { z } from "zod";
import { fmtFixo } from "../memoria";

/** Tabela 40 — fator de correção de temperatura ambiente (referência 30 °C). */
export const FCT_TABELA = {
  PVC: { 10: 1.22, 15: 1.17, 20: 1.12, 25: 1.06, 30: 1.0, 35: 0.94, 40: 0.87, 45: 0.79, 50: 0.71, 55: 0.61, 60: 0.5 },
  EPR: {
    10: 1.15, 15: 1.12, 20: 1.08, 25: 1.04, 30: 1.0, 35: 0.96, 40: 0.91, 45: 0.87, 50: 0.82,
    55: 0.76, 60: 0.71, 65: 0.65, 70: 0.58, 75: 0.5, 80: 0.41,
  },
} as const satisfies Record<string, Record<number, number>>;

export const ISOLACOES = {
  PVC: "PVC 70 °C",
  EPR: "EPR / XLPE 90 °C",
} as const;

export type Isolacao = keyof typeof FCT_TABELA;

export function temperaturasDaTabela(isolacao: Isolacao): number[] {
  return Object.keys(FCT_TABELA[isolacao]).map(Number);
}

/** Tabela 42 (linha: feixe, embutido ou conduto fechado) — fator de agrupamento por nº de circuitos. */
export function fatorAgrupamento(circuitos: number): number {
  if (circuitos <= 1) return 1.0;
  const exatos: Record<number, number> = { 2: 0.8, 3: 0.7, 4: 0.65, 5: 0.6, 6: 0.57, 7: 0.54, 8: 0.52 };
  if (circuitos <= 8) return exatos[circuitos];
  if (circuitos <= 11) return 0.5;
  if (circuitos <= 15) return 0.45;
  if (circuitos <= 19) return 0.41;
  return 0.38;
}

export const LIGACOES = {
  mono: "Monofásica (fase-neutro ou fase-fase)",
  tri: "Trifásica",
} as const;

export const cargaSchema = z.object({
  descricao: z.string().min(1, "Descreva a carga.").max(120, "A descrição da carga aceita até 120 caracteres."),
  quantidade: z.number().int().positive().default(1),
  /** Potência nominal unitária, em W. */
  potenciaW: z.number().positive(),
  fp: z.number().gt(0).max(1).default(1),
  /** Rendimento (motores); 1 para cargas resistivas e de iluminação. */
  rendimento: z.number().gt(0).max(1).default(1),
  /** Fator de demanda da linha (0–1). */
  fd: z.number().gt(0).max(1).default(1),
  tensaoV: z.number().positive(),
  ligacao: z.enum(["mono", "tri"]).default("mono"),
});

/** Condições de instalação e alimentação geral (tudo da entrada, menos a lista de cargas). */
export const condicoesSchema = z.object({
  isolacao: z.enum(["PVC", "EPR"]).default("PVC"),
  temperaturaC: z.number().default(30),
  circuitosAgrupados: z.number().int().positive().default(1),
  /** Substitui o fator da tabela quando informado (ex.: método de instalação fora da linha considerada). */
  fctManual: z.number().gt(0).max(1.5).optional(),
  fcaManual: z.number().gt(0).max(1).optional(),
  /** Alimentação geral, para a corrente total da demanda. */
  alimentacaoTensaoV: z.number().positive().default(220),
  alimentacaoLigacao: z.enum(["mono", "tri"]).default("tri"),
});

/** Regra compartilhada com o Estudos do projeto: sem FCT manual, a temperatura tem de estar na Tabela 40. */
export function validarTemperatura(
  e: Pick<z.infer<typeof condicoesSchema>, "fctManual" | "temperaturaC" | "isolacao">,
  ctx: z.RefinementCtx,
): void {
  if (e.fctManual == null && !(e.temperaturaC in FCT_TABELA[e.isolacao])) {
    ctx.addIssue({
      code: "custom",
      path: ["temperaturaC"],
      message: `Temperatura fora da Tabela 40 para ${ISOLACOES[e.isolacao]}. Use um valor da tabela ou informe o FCT.`,
    });
  }
}

export const entradaSchema = condicoesSchema
  .extend({ cargas: z.array(cargaSchema).min(1).max(200) })
  .superRefine(validarTemperatura);

export type EntradaDemanda = z.infer<typeof entradaSchema>;
export type EntradaDemandaInput = z.input<typeof entradaSchema>;
export type CargaInput = z.input<typeof cargaSchema>;

export type LinhaDemanda = {
  descricao: string;
  quantidade: number;
  pInstalada: number; // W absorvidos (qtd × P / η)
  sAparente: number; // VA
  ib: number; // A
  ibCorrigida: number; // A
  pDemandada: number; // W
  sDemandada: number; // VA
};

export type ResultadoDemanda = {
  fct: number;
  fca: number;
  linhas: LinhaDemanda[];
  pInstaladaW: number;
  pDemandadaW: number;
  sDemandadaVA: number;
  fpMedio: number;
  fatorDemandaGlobal: number;
  correnteTotalA: number;
  alertas: string[];
};

const RAIZ3 = Math.sqrt(3);
const fase = (ligacao: "mono" | "tri") => (ligacao === "tri" ? RAIZ3 : 1);

export function calcular(input: EntradaDemandaInput): ResultadoDemanda {
  const e = entradaSchema.parse(input);
  const alertas: string[] = [];

  const fct = e.fctManual ?? (FCT_TABELA[e.isolacao] as Record<number, number>)[e.temperaturaC];
  const fca = e.fcaManual ?? fatorAgrupamento(e.circuitosAgrupados);
  const fator = fct * fca;
  if (fator < 0.5) {
    alertas.push(`FCT × FCA = ${fmtFixo(fator, 2)}: a corrente corrigida dobra a de projeto. Reveja o agrupamento ou a temperatura.`);
  }

  const linhas: LinhaDemanda[] = e.cargas.map((c) => {
    const pInstalada = (c.quantidade * c.potenciaW) / c.rendimento;
    const sAparente = pInstalada / c.fp;
    const ib = pInstalada / (fase(c.ligacao) * c.tensaoV * c.fp);
    const pDemandada = pInstalada * c.fd;
    return {
      descricao: c.descricao,
      quantidade: c.quantidade,
      pInstalada,
      sAparente,
      ib,
      ibCorrigida: ib / fator,
      pDemandada,
      sDemandada: pDemandada / c.fp,
    };
  });

  const pInstaladaW = linhas.reduce((s, l) => s + l.pInstalada, 0);
  const pDemandadaW = linhas.reduce((s, l) => s + l.pDemandada, 0);
  const sDemandadaVA = linhas.reduce((s, l) => s + l.sDemandada, 0);
  const correnteTotalA = sDemandadaVA / (fase(e.alimentacaoLigacao) * e.alimentacaoTensaoV);

  return {
    fct,
    fca,
    linhas,
    pInstaladaW,
    pDemandadaW,
    sDemandadaVA,
    fpMedio: sDemandadaVA > 0 ? pDemandadaW / sDemandadaVA : 1,
    fatorDemandaGlobal: pInstaladaW > 0 ? pDemandadaW / pInstaladaW : 1,
    correnteTotalA,
    alertas,
  };
}
