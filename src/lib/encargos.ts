/**
 * Motor de encargos da folha CLT (INSS/IRRF) — PURO (sem valores embutidos).
 * As faixas vêm do banco (model EncargoFaixa), configuradas em Configurações → Encargos.
 * Com faixas vazias, retorna 0 (estrutura pronta; valores a cargo do usuário).
 */

export type Faixa = {
  /** Limite superior da faixa (R$). */
  limite: number;
  /** Alíquota (%). */
  aliquota: number;
  /** Parcela a deduzir (R$) — usado no IRRF; 0 no INSS. */
  deduzir: number;
};

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/**
 * INSS progressivo (marginal por faixa, com teto = maior limite).
 * Cada faixa tributa a parcela do salário entre o limite anterior e o seu limite.
 *
 * O valor de CADA faixa é TRUNCADO no centavo (não arredondado), e o INSS é a soma delas — é o
 * que o sistema do contador faz, e arredondar a soma dava 1 ou 2 centavos a mais no holerite
 * (ex.: base 1.771,23 → contador 135,09, arredondado 135,10). Conferido contra todas as folhas
 * reais guardadas em `modules/rh/folha/__fixtures__`.
 */
export function calcularINSS(base: number, faixas: Faixa[]): number {
  if (base <= 0 || faixas.length === 0) return 0;
  const ord = [...faixas].sort((a, b) => a.limite - b.limite);
  let centavos = 0;
  let anterior = 0;
  for (const f of ord) {
    const topo = Math.min(base, f.limite);
    if (topo > anterior) {
      const parcelaEmCentavos = Math.round((topo - anterior) * 100);
      // 1e-7 cobre o ruído de ponto flutuante (11,9999999 que devia ser 12) antes de truncar.
      centavos += Math.floor((parcelaEmCentavos * f.aliquota) / 100 + 1e-7);
    }
    anterior = f.limite;
    if (base <= f.limite) break;
  }
  return centavos / 100;
}

/**
 * IRRF: encontra a faixa cujo limite cobre a base; aplica alíquota e subtrai a parcela.
 * `base` = base de cálculo (salário − INSS − deduções). Nunca negativo.
 */
export function calcularIRRF(base: number, faixas: Faixa[]): number {
  if (base <= 0 || faixas.length === 0) return 0;
  const ord = [...faixas].sort((a, b) => a.limite - b.limite);
  const faixa = ord.find((f) => base <= f.limite) ?? ord[ord.length - 1];
  const v = base * (faixa.aliquota / 100) - faixa.deduzir;
  return v > 0 ? round2(v) : 0;
}

/**
 * Calcula INSS e IRRF a partir do total de proventos.
 * `deducaoDependentes` = (dedução por dependente) × (nº de dependentes) — abatida da base do IRRF.
 */
export function calcularEncargos(
  proventos: number,
  faixasInss: Faixa[],
  faixasIrrf: Faixa[],
  deducaoDependentes = 0,
): { inss: number; irrf: number; baseIrrf: number } {
  const inss = calcularINSS(proventos, faixasInss);
  const baseIrrf = round2(Math.max(0, proventos - inss - deducaoDependentes));
  const irrf = calcularIRRF(baseIrrf, faixasIrrf);
  return { inss, irrf, baseIrrf };
}
