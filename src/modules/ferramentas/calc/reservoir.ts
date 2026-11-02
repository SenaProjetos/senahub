/**
 * Engine H01 — Pré-dimensionamento de reservatórios inferior e superior (NBR 5626).
 * Puro. Volumes em litros, dimensões em metros.
 *
 * CD = unidades × consumo per capita ; V_reserva = CD × dias
 * Inferior = fração × V_reserva ; Superior = (1 − fração) × V_reserva
 * Total de cada reservatório = parcela de consumo + reserva técnica de incêndio (RTI), se houver.
 *
 * AGUARDA VALIDAÇÃO DO ENGENHEIRO (ver docs/engenharia/validacao/reservatorios.md):
 * - os consumos per capita são valores usuais de projeto (Macintyre/Creder); a NBR 5626 não os fixa;
 * - 2 dias de reserva e 60 % no inferior são prática de projeto, não exigência da norma;
 * - a RTI vem da instrução técnica do Corpo de Bombeiros do estado (NBR 13714 só dá a vazão mínima
 *   por tipo de hidrante), por isso não há valor padrão: o projetista informa.
 */

import { z } from "zod";

export type ConsumoOcupacao = { label: string; unidade: string; litrosPorDia: number };

/** Consumo diário usual por unidade de ocupação (L/dia por unidade). */
export const OCUPACOES = {
  residencia_popular: { label: "Residência popular", unidade: "pessoa", litrosPorDia: 120 },
  residencia_media: { label: "Residência de padrão médio", unidade: "pessoa", litrosPorDia: 150 },
  residencia_luxo: { label: "Residência de alto padrão", unidade: "pessoa", litrosPorDia: 300 },
  apartamento: { label: "Apartamento", unidade: "pessoa", litrosPorDia: 200 },
  hotel: { label: "Hotel (sem cozinha e lavanderia)", unidade: "hóspede", litrosPorDia: 120 },
  hospital: { label: "Hospital", unidade: "leito", litrosPorDia: 250 },
  escola_externato: { label: "Escola — externato", unidade: "aluno", litrosPorDia: 50 },
  escola_semi_internato: { label: "Escola — semi-internato", unidade: "aluno", litrosPorDia: 100 },
  escola_internato: { label: "Escola — internato", unidade: "aluno", litrosPorDia: 150 },
  escritorio: { label: "Escritório", unidade: "pessoa", litrosPorDia: 50 },
  restaurante: { label: "Restaurante", unidade: "refeição", litrosPorDia: 25 },
  garagem: { label: "Garagem e estacionamento", unidade: "automóvel", litrosPorDia: 50 },
  shopping: { label: "Shopping center", unidade: "m² de área construída", litrosPorDia: 5 },
} as const satisfies Record<string, ConsumoOcupacao>;

export type ChaveOcupacao = keyof typeof OCUPACOES;
export const CHAVES_OCUPACAO = Object.keys(OCUPACOES) as [ChaveOcupacao, ...ChaveOcupacao[]];

export const SISTEMAS = {
  inferior_superior: "Reservatório inferior e superior",
  somente_superior: "Somente superior (alimentação direta da rede)",
  somente_inferior: "Somente inferior (pressurização)",
} as const;

export const entradaSchema = z
  .object({
    ocupacao: z.enum([...CHAVES_OCUPACAO, "personalizado"]).default("residencia_media"),
    /** Quantidade de unidades de consumo (pessoas, leitos, m²…). */
    unidades: z.number().positive(),
    /** L/dia por unidade — obrigatório em "personalizado"; nas demais substitui o valor da tabela. */
    consumoLitrosDia: z.number().positive().optional(),
    diasReserva: z.number().positive().max(10).default(2),
    sistema: z.enum(["inferior_superior", "somente_superior", "somente_inferior"]).default("inferior_superior"),
    /** Fração do volume de consumo no inferior (só com os dois reservatórios). */
    fracaoInferior: z.number().min(0.05).max(0.95).default(0.6),
    rtiModo: z.enum(["nenhuma", "informada", "calculada"]).default("nenhuma"),
    rtiVolumeM3: z.number().positive().optional(),
    rtiHidrantes: z.number().int().positive().optional(),
    rtiVazaoLMin: z.number().positive().optional(),
    rtiMinutos: z.number().positive().optional(),
    rtiEm: z.enum(["superior", "inferior"]).default("superior"),
    alturaUtilInferiorM: z.number().positive().optional(),
    alturaUtilSuperiorM: z.number().positive().optional(),
  })
  .superRefine((e, ctx) => {
    if (e.ocupacao === "personalizado" && e.consumoLitrosDia == null) {
      ctx.addIssue({ code: "custom", path: ["consumoLitrosDia"], message: "Informe o consumo por unidade." });
    }
    if (e.rtiModo === "informada" && e.rtiVolumeM3 == null) {
      ctx.addIssue({ code: "custom", path: ["rtiVolumeM3"], message: "Informe o volume da reserva de incêndio." });
    }
    if (e.rtiModo === "calculada" && (e.rtiHidrantes == null || e.rtiVazaoLMin == null || e.rtiMinutos == null)) {
      ctx.addIssue({ code: "custom", path: ["rtiHidrantes"], message: "Informe hidrantes, vazão e tempo da reserva de incêndio." });
    }
  });

export type EntradaReservatorio = z.infer<typeof entradaSchema>;
export type EntradaReservatorioInput = z.input<typeof entradaSchema>;

export type ReservatorioDimensionado = {
  /** Parcela de consumo (L). */
  consumoL: number;
  /** Reserva técnica de incêndio alocada aqui (L). */
  rtiL: number;
  /** consumo + RTI (L). */
  totalL: number;
  totalM3: number;
  /** Área em planta (m²) e lado equivalente de seção quadrada (m), quando a altura útil foi informada. */
  areaM2: number | null;
  ladoQuadradoM: number | null;
};

export type ResultadoReservatorio = {
  consumoPorUnidade: number;
  consumoDiarioL: number;
  volumeReservaL: number;
  rtiL: number;
  totalL: number;
  inferior: ReservatorioDimensionado | null;
  superior: ReservatorioDimensionado | null;
  alertas: string[];
};

function dimensionar(
  consumoL: number,
  rtiL: number,
  alturaM: number | undefined,
): ReservatorioDimensionado {
  const totalL = consumoL + rtiL;
  const totalM3 = totalL / 1000;
  const areaM2 = alturaM != null ? totalM3 / alturaM : null;
  return {
    consumoL,
    rtiL,
    totalL,
    totalM3,
    areaM2,
    ladoQuadradoM: areaM2 != null ? Math.sqrt(areaM2) : null,
  };
}

export function calcular(input: EntradaReservatorioInput): ResultadoReservatorio {
  const e = entradaSchema.parse(input);
  const alertas: string[] = [];

  const consumoPorUnidade =
    e.consumoLitrosDia ?? (e.ocupacao === "personalizado" ? 0 : OCUPACOES[e.ocupacao].litrosPorDia);
  const consumoDiarioL = e.unidades * consumoPorUnidade;
  const volumeReservaL = consumoDiarioL * e.diasReserva;

  let rtiL = 0;
  if (e.rtiModo === "informada") rtiL = (e.rtiVolumeM3 ?? 0) * 1000;
  if (e.rtiModo === "calculada") rtiL = (e.rtiHidrantes ?? 0) * (e.rtiVazaoLMin ?? 0) * (e.rtiMinutos ?? 0);

  let consumoInferiorL = 0;
  let consumoSuperiorL = 0;
  if (e.sistema === "inferior_superior") {
    consumoInferiorL = volumeReservaL * e.fracaoInferior;
    consumoSuperiorL = volumeReservaL - consumoInferiorL;
  } else if (e.sistema === "somente_inferior") {
    consumoInferiorL = volumeReservaL;
  } else {
    consumoSuperiorL = volumeReservaL;
  }

  // Sem reservatório superior (ou inferior), a RTI fica onde existe reservatório.
  const rtiNoInferior =
    e.sistema === "somente_inferior" || (e.sistema === "inferior_superior" && e.rtiEm === "inferior");
  const inferior =
    e.sistema === "somente_superior"
      ? null
      : dimensionar(consumoInferiorL, rtiNoInferior ? rtiL : 0, e.alturaUtilInferiorM);
  const superior =
    e.sistema === "somente_inferior"
      ? null
      : dimensionar(consumoSuperiorL, rtiNoInferior ? 0 : rtiL, e.alturaUtilSuperiorM);

  if (e.diasReserva < 1) {
    alertas.push("Reserva inferior a 1 dia de consumo — confira a exigência da concessionária e a NBR 5626.");
  }
  if (e.rtiModo === "nenhuma") {
    alertas.push("Sem reserva técnica de incêndio. Se a edificação exige hidrantes, informe a RTI conforme a instrução técnica do Corpo de Bombeiros.");
  }

  return {
    consumoPorUnidade,
    consumoDiarioL,
    volumeReservaL,
    rtiL,
    totalL: volumeReservaL + rtiL,
    inferior,
    superior,
    alertas,
  };
}
