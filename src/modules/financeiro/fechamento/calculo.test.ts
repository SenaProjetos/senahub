import { describe, it, expect } from "vitest";
import { calcularFechamento, ALIQUOTAS_ZERO, type Aliquotas } from "./calculo";

describe("calcularFechamento", () => {
  it("resultado bruto = receita − despesa", () => {
    const r = calcularFechamento({ receitaConfirmada: 50000, despesaConfirmada: 30000, folhaBruta: 0 }, ALIQUOTAS_ZERO);
    expect(r.resultadoBruto).toBe(20000);
  });

  it("aplica retenções e desconto sobre a folha bruta", () => {
    const aliq: Aliquotas = { iss: 5, inss: 11, ir: 1.5, desconto: 2 };
    const r = calcularFechamento({ receitaConfirmada: 0, despesaConfirmada: 0, folhaBruta: 10000 }, aliq);
    expect(r.retencaoIss).toBe(500);
    expect(r.retencaoInss).toBe(1100);
    expect(r.retencaoIr).toBe(150);
    expect(r.descontos).toBe(200);
    expect(r.retencoesTotal).toBe(1750);
    expect(r.folhaLiquida).toBe(8050); // 10000 - 1750 - 200
  });

  it("alíquotas zero não alteram a folha", () => {
    const r = calcularFechamento({ receitaConfirmada: 0, despesaConfirmada: 0, folhaBruta: 7000 }, ALIQUOTAS_ZERO);
    expect(r.retencoesTotal).toBe(0);
    expect(r.folhaLiquida).toBe(7000);
  });

  it("arredonda a centavos", () => {
    const r = calcularFechamento({ receitaConfirmada: 0, despesaConfirmada: 0, folhaBruta: 333.33 }, { ...ALIQUOTAS_ZERO, iss: 3 });
    expect(r.retencaoIss).toBe(10); // 333.33 * 3% = 9.9999 -> 10.00
  });
});
