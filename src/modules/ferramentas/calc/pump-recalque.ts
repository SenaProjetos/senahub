/**
 * Engine H02 — Bomba de recalque de edifício (NBR 5626): vazão, diâmetros, altura manométrica e potência.
 * Puro. Litros, metros, mca, cv.
 *
 * Q = CD / horas de funcionamento
 * D_recalque (Forchheimer) = 1,3 · (h/24)^¼ · √Q ; adota o menor DN comercial com interno ≥ D
 * D_sucção = DN comercial imediatamente acima do recalque
 * hf = J · (L + Leq), J por Hazen-Williams ; Hm = Hg + hf_sucção + hf_recalque
 * P (cv) = γ·Q·Hm / (η · 735,5) ; motor = menor potência comercial ≥ P · (1 + margem)
 *
 * AGUARDA VALIDAÇÃO DO ENGENHEIRO (ver docs/engenharia/validacao/bomba-recalque.md):
 * - 6 h/dia de funcionamento, C = 140, η = 60 %, margem de potência por faixa e limites de
 *   velocidade (3,0 m/s no recalque, 2,0 m/s na sucção) são prática de projeto;
 * - perdas localizadas entram como comprimento equivalente digitado, sem tabela de conexões;
 * - NPSH disponível NÃO é calculado: confira com a curva da bomba escolhida.
 */

import { z } from "zod";
import { CHAVES_OCUPACAO, OCUPACOES } from "./reservoir";
import { fmtNum } from "../memoria";
import {
  CHAVES_DN,
  calcularTrecho,
  diametroAcima,
  diametroForchheimerMm,
  dimensionarMotor,
  menorDiametroInterno,
  type DimensionamentoMotor,
  type TrechoResultado,
} from "./hidraulica";

export const V_MAX_RECALQUE = 3.0;
export const V_MAX_SUCCAO = 2.0;
/** Acima disso a bomba acima da água pede conferência de NPSH. */
export const ALTURA_SUCCAO_ALERTA = 5;

export const ORIGENS_CONSUMO = {
  ocupacao: "Por ocupação (tabela de consumo)",
  consumo_diario: "Consumo diário informado",
} as const;

const dnSchema = z.number({ error: "Informe um número válido." }).refine((v) => (CHAVES_DN as number[]).includes(v), { message: "Diâmetro fora do catálogo." });

export const entradaSchema = z
  .object({
    origem: z.enum(["ocupacao", "consumo_diario"], { error: "Opção inválida." }).default("ocupacao"),
    ocupacao: z.enum([...CHAVES_OCUPACAO, "personalizado"], { error: "Opção inválida." }).default("residencia_media"),
    unidades: z.number({ error: "Informe um número válido." }).positive().optional(),
    /** L/dia por unidade — obrigatório em "personalizado"; nas demais substitui o valor da tabela. */
    consumoLitrosDia: z.number({ error: "Informe um número válido." }).positive().optional(),
    /** Consumo diário total (L/dia), quando a origem é "consumo_diario". */
    consumoDiarioL: z.number({ error: "Informe um número válido." }).positive().optional(),
    horasFuncionamento: z.number({ error: "Informe um número válido." }).positive("Informe as horas de funcionamento.").max(24, "O funcionamento vai até 24 h por dia.").default(6),
    /** Eixo da bomba acima (+) ou abaixo (−, afogada) do nível mínimo da água, em m. */
    alturaSuccaoM: z.number({ error: "Informe um número válido." }).min(-50, "A altura de sucção vai de −50 a 50 m.").max(50, "A altura de sucção vai de −50 a 50 m."),
    /** Do eixo da bomba até o ponto de descarga no reservatório superior, em m. */
    alturaRecalqueM: z.number({ error: "Informe um número válido." }).positive(),
    comprimentoSuccaoM: z.number({ error: "Informe um número válido." }).positive(),
    comprimentoRecalqueM: z.number({ error: "Informe um número válido." }).positive(),
    /** Comprimento equivalente das conexões e registros, em m. */
    leqSuccaoM: z.number({ error: "Informe um número válido." }).min(0).default(0),
    leqRecalqueM: z.number({ error: "Informe um número válido." }).min(0).default(0),
    /** Sem DN, adota o sugerido. */
    dnRecalque: dnSchema.optional(),
    dnSuccao: dnSchema.optional(),
    coeficienteHW: z.number({ error: "Informe um número válido." }).min(60, "O coeficiente C vai de 60 a 160.").max(160, "O coeficiente C vai de 60 a 160.").default(140),
    rendimento: z.number({ error: "Informe um número válido." }).min(0.1, "O rendimento vai de 10 % a 95 %.").max(0.95, "O rendimento vai de 10 % a 95 %.").default(0.6),
  })
  .superRefine((e, ctx) => {
    if (e.origem === "ocupacao") {
      if (e.unidades == null) {
        ctx.addIssue({ code: "custom", path: ["unidades"], message: "Informe a quantidade de unidades." });
      }
      if (e.ocupacao === "personalizado" && e.consumoLitrosDia == null) {
        ctx.addIssue({ code: "custom", path: ["consumoLitrosDia"], message: "Informe o consumo por unidade." });
      }
    } else if (e.consumoDiarioL == null) {
      ctx.addIssue({ code: "custom", path: ["consumoDiarioL"], message: "Informe o consumo diário." });
    }
  });

export type EntradaRecalque = z.infer<typeof entradaSchema>;
export type EntradaRecalqueInput = z.input<typeof entradaSchema>;

export type ResultadoRecalque = {
  consumoDiarioL: number;
  vazaoM3h: number;
  vazaoLs: number;
  vazaoM3s: number;
  /** Diâmetro calculado por Forchheimer (mm). */
  forchheimerMm: number;
  recalque: TrechoResultado;
  succao: TrechoResultado;
  /** true quando o DN foi adotado pelo cálculo (não digitado). */
  recalqueAutomatico: boolean;
  succaoAutomatico: boolean;
  alturaGeometricaM: number;
  perdaTotalMca: number;
  alturaManometricaM: number;
  motor: DimensionamentoMotor;
  alertas: string[];
};

export function calcular(input: EntradaRecalqueInput): ResultadoRecalque {
  const e = entradaSchema.parse(input);
  const alertas: string[] = [];

  let consumoDiarioL: number;
  if (e.origem === "consumo_diario") {
    consumoDiarioL = e.consumoDiarioL ?? 0;
  } else {
    const porUnidade =
      e.consumoLitrosDia ?? (e.ocupacao === "personalizado" ? 0 : OCUPACOES[e.ocupacao].litrosPorDia);
    consumoDiarioL = (e.unidades ?? 0) * porUnidade;
  }

  const vazaoM3s = consumoDiarioL / 1000 / (e.horasFuncionamento * 3600);
  const forchheimerMm = diametroForchheimerMm(vazaoM3s, e.horasFuncionamento);

  // Recalque: o digitado ou o menor comercial com interno ≥ Forchheimer.
  const sugeridoRecalque = menorDiametroInterno(forchheimerMm);
  const dnRecalque = e.dnRecalque ?? sugeridoRecalque?.dn ?? CHAVES_DN[CHAVES_DN.length - 1];
  if (!e.dnRecalque && !sugeridoRecalque) {
    alertas.push("O diâmetro calculado passa do maior DN da tabela (110 mm). Divida a vazão em mais de uma linha ou use outro material.");
  }

  // Sucção: o digitado ou o DN logo acima do recalque (o maior da tabela repete o recalque).
  const sugeridoSuccao = diametroAcima(dnRecalque)?.dn ?? dnRecalque;
  const dnSuccao = e.dnSuccao ?? sugeridoSuccao;

  const recalque = calcularTrecho({
    vazaoM3s,
    dn: dnRecalque,
    comprimentoM: e.comprimentoRecalqueM,
    leqM: e.leqRecalqueM,
    c: e.coeficienteHW,
  });
  const succao = calcularTrecho({
    vazaoM3s,
    dn: dnSuccao,
    comprimentoM: e.comprimentoSuccaoM,
    leqM: e.leqSuccaoM,
    c: e.coeficienteHW,
  });

  const alturaGeometricaM = e.alturaSuccaoM + e.alturaRecalqueM;
  const perdaTotalMca = recalque.perdaMca + succao.perdaMca;
  const alturaManometricaM = alturaGeometricaM + perdaTotalMca;
  const motor = dimensionarMotor(vazaoM3s, alturaManometricaM, e.rendimento);

  if (recalque.velocidadeMs > V_MAX_RECALQUE) {
    alertas.push(`Velocidade no recalque de ${fmtNum(recalque.velocidadeMs, 2)} m/s passa de ${fmtNum(V_MAX_RECALQUE, 1)} m/s — aumente o diâmetro.`);
  }
  if (succao.velocidadeMs > V_MAX_SUCCAO) {
    alertas.push(`Velocidade na sucção de ${fmtNum(succao.velocidadeMs, 2)} m/s passa de ${fmtNum(V_MAX_SUCCAO, 1)} m/s — aumente o diâmetro.`);
  }
  if (succao.dn < recalque.dn) {
    alertas.push("A sucção está com diâmetro menor que o recalque. A prática é sucção igual ou maior.");
  }
  if (e.alturaSuccaoM > ALTURA_SUCCAO_ALERTA) {
    alertas.push(`Bomba ${fmtNum(e.alturaSuccaoM, 1)} m acima da água: confira o NPSH disponível, que esta calculadora não calcula.`);
  }
  if (alturaManometricaM <= 0) {
    alertas.push("A altura manométrica ficou zero ou negativa (sucção afogada maior que o recalque). Confira as alturas: não há motor a dimensionar.");
  } else if (motor.motorCv == null) {
    alertas.push("A potência com margem passa do maior motor da tabela (200 cv). Consulte o fabricante.");
  }

  return {
    consumoDiarioL,
    vazaoM3h: vazaoM3s * 3600,
    vazaoLs: vazaoM3s * 1000,
    vazaoM3s,
    forchheimerMm,
    recalque,
    succao,
    recalqueAutomatico: e.dnRecalque == null,
    succaoAutomatico: e.dnSuccao == null,
    alturaGeometricaM,
    perdaTotalMca,
    alturaManometricaM,
    motor,
    alertas,
  };
}
