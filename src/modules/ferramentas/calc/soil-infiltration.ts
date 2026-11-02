/**
 * Engine H04 — Destino final do esgoto: sumidouro dimensionado pelo teste de percolação e pela
 * sondagem (nível d'água). Puro. L, m, m², minutos.
 *
 * V = N · C (ou volume diário informado)
 * por furo: t = tempo ÷ rebaixamento (min para o nível baixar 1 cm) ; Ci = 490 ÷ (t + 2,5) (L/m²·dia)
 * Ci adotado = o MENOR dos furos (sumidouro) ou o Ci informado de um laudo
 * A necessária = V ÷ Ci ; área de uma unidade = π·D·H (+ π·D²/4 se o fundo contar)
 * Folga ao lençol = nível d'água − fundo ; limite = nível d'água − distância mínima − topo
 *
 * AGUARDA VALIDAÇÃO DO ENGENHEIRO (ver docs/engenharia/validacao/esgoto-infiltracao.md):
 * - a NBR 7229:1993 e a NBR 13969:1997 foram substituídas pela NBR 17076:2024. O texto novo NÃO foi
 *   conferido aqui: a curva Ci = 490/(t + 2,5), a distância mínima de 1,50 m ao lençol, o uso só da
 *   parede lateral e o uso alternado das unidades vêm da prática e das normas antigas;
 * - contribuição por pessoa não tem valor padrão (a tabela da norma não foi conferida): o projetista digita;
 * - fora do escopo: vala de infiltração, filtro anaeróbio, camada impenetrável, distâncias a poços e divisas.
 */

import { z } from "zod";
import { fmtNum } from "../memoria";

export const MAX_FUROS = 20;
/** Distância mínima padrão entre o fundo da unidade e o lençol freático (m). */
export const DISTANCIA_MINIMA_LENCOL_M = 1.5;

export const CONTRIBUICOES = {
  pessoas: "Pessoas × contribuição por pessoa",
  volume: "Volume diário informado",
} as const;

export const ORIGENS_CI = {
  percolacao: "Teste de percolação",
  informado: "Coeficiente informado (laudo)",
} as const;

export const furoSchema = z.object({
  /** Tempo medido para o nível baixar `rebaixamentoCm`. */
  tempoMin: z.number({ error: "Informe um número válido." }).positive("Informe o tempo de cada furo em minutos."),
  rebaixamentoCm: z.number({ error: "Informe um número válido." }).positive("Informe o rebaixamento de cada furo em cm.").default(1),
});

export const entradaSchema = z
  .object({
    contribuicao: z.enum(["pessoas", "volume"], { error: "Opção inválida." }).default("pessoas"),
    pessoas: z.number({ error: "Informe um número válido." }).int("O número de pessoas deve ser inteiro.").positive("Informe o número de pessoas.").optional(),
    /** L por pessoa por dia. Sem valor padrão. */
    contribuicaoLPessoaDia: z.number({ error: "Informe um número válido." }).positive("Informe a contribuição por pessoa.").optional(),
    volumeDiarioL: z.number({ error: "Informe um número válido." }).positive("Informe o volume diário.").optional(),
    origemCi: z.enum(["percolacao", "informado"], { error: "Opção inválida." }).default("percolacao"),
    furos: z.array(furoSchema).max(MAX_FUROS, `Use no máximo ${MAX_FUROS} furos.`).default([]),
    ciInformado: z.number({ error: "Informe um número válido." }).positive("Informe o coeficiente de infiltração.").optional(),
    diametroM: z.number({ error: "Informe um número válido." }).positive("Informe o diâmetro do sumidouro."),
    unidades: z.number({ error: "Informe um número válido." }).int("O número de unidades deve ser inteiro.").min(1, "Use ao menos 1 unidade.").max(20, "Use no máximo 20 unidades.").default(1),
    considerarFundo: z.boolean().default(false),
    /** Do terreno ao topo (laje de tampa) do sumidouro, em m. */
    profundidadeTopoM: z.number({ error: "Informe um número válido." }).min(0, "A profundidade do topo não pode ser negativa.").default(0),
    /** Profundidade do nível d'água na sondagem, em m. Sem ela, não há verificação do lençol. */
    nivelAguaM: z.number({ error: "Informe um número válido." }).positive("Informe a profundidade do nível d'água.").optional(),
    distanciaMinimaLencolM: z.number({ error: "Informe um número válido." }).positive("Informe a distância mínima ao lençol.").default(DISTANCIA_MINIMA_LENCOL_M),
  })
  .superRefine((e, ctx) => {
    const falta = (campo: string, msg: string) => ctx.addIssue({ code: "custom", path: [campo], message: msg });
    if (e.contribuicao === "pessoas") {
      if (e.pessoas == null) falta("pessoas", "Informe o número de pessoas.");
      if (e.contribuicaoLPessoaDia == null) falta("contribuicaoLPessoaDia", "Informe a contribuição por pessoa.");
    } else if (e.volumeDiarioL == null) {
      falta("volumeDiarioL", "Informe o volume diário.");
    }
    if (e.origemCi === "percolacao") {
      if (e.furos.length === 0) falta("furos", "Informe ao menos um furo do teste de percolação.");
    } else if (e.ciInformado == null) {
      falta("ciInformado", "Informe o coeficiente de infiltração.");
    }
  });

export type EntradaInfiltracao = z.infer<typeof entradaSchema>;
export type EntradaInfiltracaoInput = z.input<typeof entradaSchema>;

export type FuroResultado = {
  /** Minutos para o nível baixar 1 cm. */
  minPorCm: number;
  /** Taxa de percolação em min/m. */
  minPorM: number;
  /** Coeficiente de infiltração do furo, L/m²·dia. */
  ci: number;
};

export type LimiteLencol = {
  /** Profundidade máxima útil (m) que ainda respeita a distância mínima ao lençol; pode ser ≤ 0. */
  profundidadeMaximaM: number;
  /** Nível d'água − fundo (m); negativo se o fundo passa do lençol. */
  folgaM: number;
  cabe: boolean;
  /** Unidades iguais que cabem acima do limite; null se o lençol é raso demais. */
  unidadesParaCaber: number | null;
};

export type ResultadoInfiltracao = {
  volumeDiarioL: number;
  furos: FuroResultado[];
  ciAdotado: number;
  areaNecessariaM2: number;
  areaPorUnidadeM2: number;
  profundidadeUtilM: number;
  profundidadeFundoM: number;
  limite: LimiteLencol | null;
  alertas: string[];
};

/** Menor Ci da lista; a divisão e a soma são as da curva, sem arredondar. */
export function ciDoFuro(f: { tempoMin: number; rebaixamentoCm: number }): FuroResultado {
  const minPorCm = f.tempoMin / f.rebaixamentoCm;
  return { minPorCm, minPorM: minPorCm * 100, ci: 490 / (minPorCm + 2.5) };
}

/** Área lateral de um sumidouro cilíndrico, mais o fundo se ele contar. */
export function areaDaUnidade(diametroM: number, alturaM: number, comFundo: boolean): number {
  return Math.PI * diametroM * alturaM + (comFundo ? (Math.PI * diametroM ** 2) / 4 : 0);
}

export function calcular(input: EntradaInfiltracaoInput): ResultadoInfiltracao {
  const e = entradaSchema.parse(input);
  const alertas: string[] = [];

  const volumeDiarioL =
    e.contribuicao === "pessoas" ? (e.pessoas ?? 0) * (e.contribuicaoLPessoaDia ?? 0) : (e.volumeDiarioL ?? 0);

  const furos = e.origemCi === "percolacao" ? e.furos.map(ciDoFuro) : [];
  const ciAdotado = e.origemCi === "percolacao" ? Math.min(...furos.map((f) => f.ci)) : (e.ciInformado ?? 0);

  const areaNecessariaM2 = volumeDiarioL / ciAdotado;
  const areaPorUnidadeM2 = areaNecessariaM2 / e.unidades;
  const fundoM2 = e.considerarFundo ? (Math.PI * e.diametroM ** 2) / 4 : 0;
  const lateralM2 = Math.max(0, areaPorUnidadeM2 - fundoM2);
  const profundidadeUtilM = lateralM2 / (Math.PI * e.diametroM);
  const profundidadeFundoM = e.profundidadeTopoM + profundidadeUtilM;

  if (e.considerarFundo && areaPorUnidadeM2 <= fundoM2) {
    alertas.push("O fundo sozinho já atende a área necessária. Confira se contar o fundo é aceito pelo projeto.");
  }
  if (e.origemCi === "percolacao" && furos.length === 1) {
    alertas.push("Teste com um único furo: confira na norma o número mínimo de furos.");
  }
  if (e.unidades < 2) {
    alertas.push("Confira na NBR 17076:2024 a exigência de uso alternado das unidades de disposição final.");
  }

  let limite: LimiteLencol | null = null;
  if (e.nivelAguaM != null) {
    const profundidadeMaximaM = e.nivelAguaM - e.distanciaMinimaLencolM - e.profundidadeTopoM;
    const areaNoLimite = profundidadeMaximaM > 0 ? areaDaUnidade(e.diametroM, profundidadeMaximaM, e.considerarFundo) : 0;
    // Tolerância de ponto flutuante: 3,0000000001 unidades não pedem 4.
    const unidadesParaCaber = areaNoLimite > 0 ? Math.ceil(areaNecessariaM2 / areaNoLimite - 1e-9) : null;
    const cabe = profundidadeUtilM <= Math.max(0, profundidadeMaximaM) + 1e-9;
    limite = { profundidadeMaximaM, folgaM: e.nivelAguaM - profundidadeFundoM, cabe, unidadesParaCaber };
    if (!cabe) {
      alertas.push(
        unidadesParaCaber != null
          ? `O fundo chega a ${fmtNum(profundidadeFundoM, 2)} m e o lençol exige parar em ${fmtNum(e.nivelAguaM - e.distanciaMinimaLencolM, 2)} m. Use ${unidadesParaCaber} unidades deste diâmetro ou aumente o diâmetro.`
          : "O lençol está raso demais para um sumidouro com esta distância mínima. Estude outra solução de disposição final.",
      );
    }
  } else {
    alertas.push("Sem o nível d'água da sondagem, a distância ao lençol não foi verificada.");
  }

  return {
    volumeDiarioL,
    furos,
    ciAdotado,
    areaNecessariaM2,
    areaPorUnidadeM2,
    profundidadeUtilM,
    profundidadeFundoM,
    limite,
    alertas,
  };
}
