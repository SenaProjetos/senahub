import { describe, expect, it } from "vitest";
import {
  CHAVE_RETENCAO_FEITA,
  CHAVE_RETENCAO_SOFRIDA,
  DIAS_PADRAO,
  MOTIVO_RETENCAO_MAIOR,
  MOTIVO_RETENCAO_NEGATIVA,
  MOTIVO_RETENCAO_REPETIDA,
  diasDaConfig,
  impostosEstimados,
  liquidoDoTitulo,
  mesmasRetencoes,
  motivoRetencaoParcial,
  motivoRetencoesInvalidas,
  normalizarRetencoes,
  planejarRetencoesNaBaixa,
  totalRetido,
  vencimentoDoImposto,
} from "@/modules/financeiro/lancamentos/retencoes";

describe("normalizarRetencoes", () => {
  it("reais para centavos, zeros somem, ordem fixa (ISS, IRRF, INSS, PIS, COFINS, CSLL)", () => {
    expect(
      normalizarRetencoes([
        { imposto: "irrf", valor: 150 },
        { imposto: "inss", valor: 0 },
        { imposto: "iss", valor: 500.1 },
      ]),
    ).toEqual([
      { imposto: "iss", valorCentavos: 500_10 },
      { imposto: "irrf", valorCentavos: 150_00 },
    ]);
  });
});

describe("motivoRetencoesInvalidas", () => {
  const r = (imposto: "iss" | "irrf", valorCentavos: number) => ({ imposto, valorCentavos });
  it("aceita retenção menor que a nota e lista vazia", () => {
    expect(motivoRetencoesInvalidas(10000_00, [r("iss", 500_00), r("irrf", 150_00)])).toBeNull();
    expect(motivoRetencoesInvalidas(10000_00, [])).toBeNull();
  });
  it("recusa negativa, imposto repetido e soma igual ou maior que a nota", () => {
    expect(motivoRetencoesInvalidas(10000_00, [r("iss", -1)])).toBe(MOTIVO_RETENCAO_NEGATIVA);
    expect(motivoRetencoesInvalidas(10000_00, [r("iss", 1), r("iss", 2)])).toBe(MOTIVO_RETENCAO_REPETIDA);
    expect(motivoRetencoesInvalidas(100_00, [r("iss", 100_00)])).toBe(MOTIVO_RETENCAO_MAIOR);
    expect(motivoRetencoesInvalidas(100_00, [r("iss", 60_00), r("irrf", 50_00)])).toBe(MOTIVO_RETENCAO_MAIOR);
  });
});

it("líquido = nota − retido", () => {
  const ret = [{ valorCentavos: 500_00 }, { valorCentavos: 150_00 }];
  expect(totalRetido(ret)).toBe(650_00);
  expect(liquidoDoTitulo(10000_00, ret)).toBe(9350_00);
});

describe("vencimentoDoImposto", () => {
  it("dia configurado do mês seguinte ao pagamento", () => {
    expect(vencimentoDoImposto("2026-10-20", 10)).toBe("2026-11-10");
    expect(vencimentoDoImposto("2026-10-01", 15)).toBe("2026-11-15");
  });
  it("virada de ano e mês curto", () => {
    expect(vencimentoDoImposto("2026-12-28", 10)).toBe("2027-01-10");
    expect(vencimentoDoImposto("2027-01-15", 31)).toBe("2027-02-28");
    expect(vencimentoDoImposto("2028-01-15", 30)).toBe("2028-02-29");
  });
});

describe("planejarRetencoesNaBaixa", () => {
  const retencoes = [
    { imposto: "iss" as const, valorCentavos: 500_00 },
    { imposto: "irrf" as const, valorCentavos: 150_00 },
  ];

  it("conta a pagar: acessório RECEITA por imposto (o banco sai o líquido) + uma conta a recolher por imposto", () => {
    const p = planejarRetencoesNaBaixa({ tipo: "despesa", retencoes, diaPagamento: "2026-10-20", dias: DIAS_PADRAO });
    expect(p.retidoCentavos).toBe(650_00);
    expect(p.acessorios).toEqual([
      { imposto: "iss", tipo: "receita", chaveCategoria: CHAVE_RETENCAO_FEITA, valorCentavos: 500_00, rotulo: "ISS retido" },
      { imposto: "irrf", tipo: "receita", chaveCategoria: CHAVE_RETENCAO_FEITA, valorCentavos: 150_00, rotulo: "IRRF retido" },
    ]);
    expect(p.aRecolher.map((x) => [x.imposto, x.valorCentavos, x.vencimento])).toEqual([
      ["iss", 500_00, "2026-11-10"],
      ["irrf", 150_00, "2026-11-15"],
    ]);
  });

  it("conta a receber: acessório DESPESA por imposto (o banco recebe o líquido) e nenhuma conta nasce", () => {
    const p = planejarRetencoesNaBaixa({ tipo: "receita", retencoes: [{ imposto: "iss", valorCentavos: 900_00 }], diaPagamento: "2026-10-12", dias: DIAS_PADRAO });
    expect(p.acessorios).toEqual([{ imposto: "iss", tipo: "despesa", chaveCategoria: CHAVE_RETENCAO_SOFRIDA, valorCentavos: 900_00, rotulo: "ISS retido pelo cliente" }]);
    expect(p.aRecolher).toEqual([]);
  });

  it("sem retenção não grava nada", () => {
    expect(planejarRetencoesNaBaixa({ tipo: "despesa", retencoes: [], diaPagamento: "2026-10-20", dias: DIAS_PADRAO })).toEqual({ acessorios: [], aRecolher: [], retidoCentavos: 0 });
  });
});

it("motivo do parcial diz pagar ou receber conforme o tipo", () => {
  expect(motivoRetencaoParcial("despesa")).toBe("Conta com retenção só se paga inteira: o imposto é retido sobre a nota toda.");
  expect(motivoRetencaoParcial("receita")).toBe("Conta com retenção só se recebe inteira: o imposto é retido sobre a nota toda.");
});

it("diasDaConfig: padrão do contador; valores fora de 1–31 ignorados", () => {
  expect(diasDaConfig(null)).toEqual(DIAS_PADRAO);
  expect(diasDaConfig({ iss: 5, irrf: 40, pis: "20" })).toEqual({ ...DIAS_PADRAO, iss: 5, pis: 20 });
});

describe("impostosEstimados (planejador)", () => {
  const nota = { id: "nf", tipo: "despesa" as const, data: "2026-10-20", descricao: "Projeto de fundações" };
  it("um evento por imposto no dia configurado do mês seguinte ao vencimento da nota", () => {
    expect(impostosEstimados(nota, [{ imposto: "iss", valorCentavos: 500_00 }, { imposto: "irrf", valorCentavos: 150_00 }], DIAS_PADRAO)).toEqual([
      { id: "ret:nf:iss", imposto: "iss", data: "2026-11-10", valorCentavos: 500_00, descricao: "ISS retido (estimado) — Projeto de fundações" },
      { id: "ret:nf:irrf", imposto: "irrf", data: "2026-11-15", valorCentavos: 150_00, descricao: "IRRF retido (estimado) — Projeto de fundações" },
    ]);
  });
  it("conta a receber não gera imposto a pagar (quem recolhe é o cliente)", () => {
    expect(impostosEstimados({ ...nota, tipo: "receita" }, [{ imposto: "iss", valorCentavos: 900_00 }], DIAS_PADRAO)).toEqual([]);
  });
});

it("mesmasRetencoes compara imposto e valor na ordem fixa", () => {
  expect(mesmasRetencoes([{ imposto: "iss", valorCentavos: 1 }], [{ imposto: "iss", valorCentavos: 1 }])).toBe(true);
  expect(mesmasRetencoes([{ imposto: "iss", valorCentavos: 1 }], [{ imposto: "iss", valorCentavos: 2 }])).toBe(false);
  expect(mesmasRetencoes([], [{ imposto: "iss", valorCentavos: 2 }])).toBe(false);
});
