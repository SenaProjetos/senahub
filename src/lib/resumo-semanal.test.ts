import { describe, expect, it } from "vitest";
import { corpoResumoSemanal } from "./resumo-semanal";

const dados = { entregas: 15, aReceber: 10100, aPagar: 22225.01 };

describe("corpoResumoSemanal", () => {
  it("inclui a receber e a pagar para quem vê o financeiro", () => {
    const corpo = corpoResumoSemanal(dados, true);
    expect(corpo).toContain("15 entrega(s) com prazo");
    expect(corpo).toContain("a receber R$");
    expect(corpo).toContain("a pagar R$");
  });

  it("não vaza nenhum valor financeiro para quem não vê o financeiro", () => {
    const corpo = corpoResumoSemanal(dados, false);
    expect(corpo).toBe("Semana: 15 entrega(s) com prazo.");
    expect(corpo).not.toMatch(/R\$|receber|pagar/);
  });
});
