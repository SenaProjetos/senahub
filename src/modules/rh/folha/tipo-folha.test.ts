import { describe, expect, it } from "vitest";
import { pareceDecimoTerceiro, rotuloFolha } from "./tipo-folha";

describe("pareceDecimoTerceiro", () => {
  it.each([
    "13º Salário",
    "INSS 13º Salário",
    "IRRF s/ 13°",
    "Adiantamento 13o salário",
    "1ª parcela 13 salário",
    "Décimo terceiro",
    "DECIMO TERCEIRO SALARIO",
    "Gratificação Natalina",
    "Grat. Nat. 1ª parc.",
    "Gratif. Natal.",
  ])("reconhece %s", (d) => expect(pareceDecimoTerceiro(d)).toBe(true));

  it.each([
    "Salário Base",
    "INSS Folha",
    "Vale Transporte",
    "diferença salarial 05/2026", // rubrica real 081 de junho/2026
    "Hora extra 50%",
    "Adicional noturno 213,00",
    "Dia 13 de férias",
  ])("não confunde %s", (d) => expect(pareceDecimoTerceiro(d)).toBe(false));

  it("nenhuma rubrica dos 4 PDFs reais mensais (05–08/2026) parece 13º", () => {
    for (const d of ["Salário Base", "INSS Folha", "Vale Transporte", "diferença salarial 05/2026"]) {
      expect(pareceDecimoTerceiro(d)).toBe(false);
    }
  });
});

describe("rotuloFolha", () => {
  it("mensal mostra só a competência; 13º leva o tipo na frente", () => {
    expect(rotuloFolha({ ano: 2026, mes: 7, tipo: "mensal" })).toBe("07/2026");
    expect(rotuloFolha({ ano: 2026, mes: 12, tipo: "decimo_terceiro" })).toBe("13º salário 12/2026");
  });
});
