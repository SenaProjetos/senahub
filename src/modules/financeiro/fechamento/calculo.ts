/**
 * Cálculo do fechamento mensal (puro, testável).
 *
 * Retenções (ISS/INSS/IR) e desconto são alíquotas (%) aplicadas sobre a folha bruta
 * de projetistas. O resultado do mês (receita − despesa) é consolidado à parte.
 */

export type Aliquotas = { iss: number; inss: number; ir: number; desconto: number };

export const ALIQUOTAS_ZERO: Aliquotas = { iss: 0, inss: 0, ir: 0, desconto: 0 };

export type FechamentoEntrada = {
  receitaConfirmada: number;
  despesaConfirmada: number;
  folhaBruta: number;
};

export type FechamentoCalc = {
  resultadoBruto: number;
  retencaoIss: number;
  retencaoInss: number;
  retencaoIr: number;
  retencoesTotal: number;
  descontos: number;
  folhaLiquida: number;
};

const cent = (v: number) => Math.round(v * 100) / 100;
const aplica = (base: number, aliquota: number) => cent((base * aliquota) / 100);

export function calcularFechamento(e: FechamentoEntrada, a: Aliquotas): FechamentoCalc {
  const retencaoIss = aplica(e.folhaBruta, a.iss);
  const retencaoInss = aplica(e.folhaBruta, a.inss);
  const retencaoIr = aplica(e.folhaBruta, a.ir);
  const descontos = aplica(e.folhaBruta, a.desconto);
  const retencoesTotal = cent(retencaoIss + retencaoInss + retencaoIr);
  return {
    resultadoBruto: cent(e.receitaConfirmada - e.despesaConfirmada),
    retencaoIss,
    retencaoInss,
    retencaoIr,
    retencoesTotal,
    descontos,
    folhaLiquida: cent(e.folhaBruta - retencoesTotal - descontos),
  };
}
