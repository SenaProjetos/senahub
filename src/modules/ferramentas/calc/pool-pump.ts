/**
 * Engine H03 — Bomba de recirculação de piscina (NBR 10339): volume, vazão, perda de carga e potência.
 * Puro. m, m³, m³/h, mca, cv.
 *
 * V = volume da piscina ; Q = V / tempo de recirculação
 * hf = J · (L + Leq) em cada trecho (sucção e retorno), J por Hazen-Williams
 * Hm = hf_sucção + hf_retorno + perda nos equipamentos + pressão residual nos retornos
 *   (circuito fechado com superfície livre: não há desnível geométrico a vencer)
 * P (cv) = γ·Q·Hm / (η · 735,5) ; motor = menor potência comercial ≥ P · (1 + margem)
 *
 * AGUARDA VALIDAÇÃO DO ENGENHEIRO (ver docs/engenharia/validacao/bomba-piscina.md):
 * - tempos de recirculação por uso (6 h, 4 h, 2 h) e os limites de velocidade (sucção 1,8 m/s,
 *   retorno 3,0 m/s) são prática de projeto, a confirmar contra a NBR 10339;
 * - perda dos equipamentos (filtro, pré-filtro, aquecedor) e pressão residual não têm valor
 *   padrão: o projetista informa pelo catálogo do fabricante;
 * - a taxa de filtração não tem valor padrão (depende do filtro): sem ela, não há área filtrante.
 */

import { z } from "zod";
import { fmtNum } from "../memoria";
import {
  CHAVES_DN,
  calcularTrecho,
  dimensionarMotor,
  menorDiametroPorVelocidade,
  type DimensionamentoMotor,
  type TrechoResultado,
} from "./hidraulica";

export const V_MAX_SUCCAO_PISCINA = 1.8;
export const V_MAX_RETORNO_PISCINA = 3.0;

export const USOS = {
  residencial: { label: "Residencial", horas: 6 },
  coletiva: { label: "Uso coletivo (clube, hotel, condomínio)", horas: 4 },
  infantil: { label: "Infantil ou rasa", horas: 2 },
} as const;
export type ChaveUso = keyof typeof USOS;
export const CHAVES_USO = Object.keys(USOS) as [ChaveUso, ...ChaveUso[]];

export const FORMAS = {
  retangular: "Retangular",
  circular: "Circular",
  volume: "Volume informado",
} as const;

const dnSchema = z.number().refine((v) => (CHAVES_DN as number[]).includes(v), { message: "Diâmetro fora do catálogo." });

export const entradaSchema = z
  .object({
    forma: z.enum(["retangular", "circular", "volume"]).default("retangular"),
    comprimentoM: z.number().positive().optional(),
    larguraM: z.number().positive().optional(),
    diametroM: z.number().positive().optional(),
    profundidadeMediaM: z.number().positive().optional(),
    volumeM3: z.number().positive().optional(),
    uso: z.enum(CHAVES_USO).default("residencial"),
    /** Substitui o tempo do uso. */
    horasRecirculacao: z.number().positive("Informe o tempo de recirculação.").max(24, "A recirculação vai até 24 h.").optional(),
    comprimentoSuccaoM: z.number().positive(),
    comprimentoRetornoM: z.number().positive(),
    leqSuccaoM: z.number().min(0).default(0),
    leqRetornoM: z.number().min(0).default(0),
    /** Sem DN, adota o menor que respeita o limite de velocidade. */
    dnSuccao: dnSchema.optional(),
    dnRetorno: dnSchema.optional(),
    /** Filtro, pré-filtro, aquecedor etc., em mca, pelo fabricante. */
    perdaEquipamentosMca: z.number().min(0).default(0),
    /** Pressão a manter nos dispositivos de retorno, em mca. */
    pressaoRetornoMca: z.number().min(0).default(0),
    /** m³/h por m² de filtro; só com ela sai a área filtrante. */
    taxaFiltracao: z.number().positive().optional(),
    coeficienteHW: z.number().min(60, "O coeficiente C vai de 60 a 160.").max(160, "O coeficiente C vai de 60 a 160.").default(140),
    rendimento: z.number().min(0.1, "O rendimento vai de 10 % a 95 %.").max(0.95, "O rendimento vai de 10 % a 95 %.").default(0.5),
  })
  .superRefine((e, ctx) => {
    const falta = (campo: string, msg: string) => ctx.addIssue({ code: "custom", path: [campo], message: msg });
    if (e.forma === "volume") {
      if (e.volumeM3 == null) falta("volumeM3", "Informe o volume da piscina.");
      return;
    }
    if (e.profundidadeMediaM == null) falta("profundidadeMediaM", "Informe a profundidade média.");
    if (e.forma === "retangular") {
      if (e.comprimentoM == null) falta("comprimentoM", "Informe o comprimento.");
      if (e.larguraM == null) falta("larguraM", "Informe a largura.");
    } else if (e.diametroM == null) {
      falta("diametroM", "Informe o diâmetro.");
    }
  });

export type EntradaPiscina = z.infer<typeof entradaSchema>;
export type EntradaPiscinaInput = z.input<typeof entradaSchema>;

export type ResultadoPiscina = {
  volumeM3: number;
  horasRecirculacao: number;
  vazaoM3h: number;
  vazaoLs: number;
  vazaoM3s: number;
  succao: TrechoResultado;
  retorno: TrechoResultado;
  succaoAutomatico: boolean;
  retornoAutomatico: boolean;
  perdaTubulacaoMca: number;
  alturaManometricaM: number;
  areaFiltranteM2: number | null;
  motor: DimensionamentoMotor;
  alertas: string[];
};

export function volumeDaPiscina(e: EntradaPiscina): number {
  if (e.forma === "volume") return e.volumeM3 ?? 0;
  const area =
    e.forma === "retangular"
      ? (e.comprimentoM ?? 0) * (e.larguraM ?? 0)
      : (Math.PI * (e.diametroM ?? 0) ** 2) / 4;
  return area * (e.profundidadeMediaM ?? 0);
}

export function calcular(input: EntradaPiscinaInput): ResultadoPiscina {
  const e = entradaSchema.parse(input);
  const alertas: string[] = [];

  const volumeM3 = volumeDaPiscina(e);
  const horasRecirculacao = e.horasRecirculacao ?? USOS[e.uso].horas;
  const vazaoM3h = volumeM3 / horasRecirculacao;
  const vazaoM3s = vazaoM3h / 3600;

  const sugeridoSuccao = menorDiametroPorVelocidade(vazaoM3s, V_MAX_SUCCAO_PISCINA);
  const sugeridoRetorno = menorDiametroPorVelocidade(vazaoM3s, V_MAX_RETORNO_PISCINA);
  const maiorDn = CHAVES_DN[CHAVES_DN.length - 1];
  const dnSuccao = e.dnSuccao ?? sugeridoSuccao?.dn ?? maiorDn;
  const dnRetorno = e.dnRetorno ?? sugeridoRetorno?.dn ?? maiorDn;

  const succao = calcularTrecho({
    vazaoM3s,
    dn: dnSuccao,
    comprimentoM: e.comprimentoSuccaoM,
    leqM: e.leqSuccaoM,
    c: e.coeficienteHW,
  });
  const retorno = calcularTrecho({
    vazaoM3s,
    dn: dnRetorno,
    comprimentoM: e.comprimentoRetornoM,
    leqM: e.leqRetornoM,
    c: e.coeficienteHW,
  });

  const perdaTubulacaoMca = succao.perdaMca + retorno.perdaMca;
  const alturaManometricaM = perdaTubulacaoMca + e.perdaEquipamentosMca + e.pressaoRetornoMca;
  const motor = dimensionarMotor(vazaoM3s, alturaManometricaM, e.rendimento);
  const areaFiltranteM2 = e.taxaFiltracao != null ? vazaoM3h / e.taxaFiltracao : null;

  if (succao.velocidadeMs > V_MAX_SUCCAO_PISCINA) {
    alertas.push(`Velocidade na sucção de ${fmtNum(succao.velocidadeMs, 2)} m/s passa de ${fmtNum(V_MAX_SUCCAO_PISCINA, 1)} m/s — aumente o diâmetro.`);
  }
  if (retorno.velocidadeMs > V_MAX_RETORNO_PISCINA) {
    alertas.push(`Velocidade no retorno de ${fmtNum(retorno.velocidadeMs, 2)} m/s passa de ${fmtNum(V_MAX_RETORNO_PISCINA, 1)} m/s — aumente o diâmetro.`);
  }
  if (e.perdaEquipamentosMca === 0) {
    alertas.push("Sem perda de carga dos equipamentos (filtro, pré-filtro, aquecedor). Informe o valor do catálogo do fabricante: a altura manométrica está subestimada.");
  }
  if (e.taxaFiltracao == null) {
    alertas.push("Sem taxa de filtração, a área filtrante não é calculada. Use a taxa do filtro escolhido.");
  }
  if (!sugeridoSuccao && !e.dnSuccao) {
    alertas.push("Nenhum DN da tabela atende o limite de velocidade na sucção. Divida a vazão em mais de uma linha de sucção.");
  }
  if (!sugeridoRetorno && !e.dnRetorno) {
    alertas.push("Nenhum DN da tabela atende o limite de velocidade no retorno. Divida a vazão em mais de uma linha de retorno.");
  }
  if (alturaManometricaM <= 0) {
    alertas.push("A altura manométrica ficou zero: informe a perda dos equipamentos ou confira os comprimentos.");
  } else if (motor.motorCv == null) {
    alertas.push("A potência com margem passa do maior motor da tabela (200 cv). Consulte o fabricante.");
  }

  return {
    volumeM3,
    horasRecirculacao,
    vazaoM3h,
    vazaoLs: vazaoM3s * 1000,
    vazaoM3s,
    succao,
    retorno,
    succaoAutomatico: e.dnSuccao == null,
    retornoAutomatico: e.dnRetorno == null,
    perdaTubulacaoMca,
    alturaManometricaM,
    areaFiltranteM2,
    motor,
    alertas,
  };
}
