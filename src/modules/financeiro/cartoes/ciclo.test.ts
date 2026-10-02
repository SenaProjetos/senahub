import { describe, expect, it } from "vitest";
import {
  cicloDaCompetencia,
  cicloDaCompra,
  descricaoDaParcela,
  diaValido,
  MOTIVO_FATURA_ABERTA,
  MOTIVO_FATURA_PAGA,
  MOTIVO_FATURA_VAZIA,
  motivoParaNaoPagar,
  parcelasDaCompra,
  rotuloDaCompetencia,
  rotuloDoEventoDaFatura,
  situacaoDaFatura,
  somarCompetencia,
} from "@/modules/financeiro/cartoes/ciclo";

const cartao = { diaFechamento: 25, diaVencimento: 5 };

describe("ciclo da compra", () => {
  it("comprou até o fechamento: fatura do próprio mês; depois: a do mês seguinte", () => {
    expect(cicloDaCompra(cartao, "2026-10-25")).toEqual({
      competencia: "2026-10",
      inicioCiclo: "2026-09-26",
      fimCiclo: "2026-10-25",
      vencimento: "2026-11-05",
    });
    expect(cicloDaCompra(cartao, "2026-10-26").competencia).toBe("2026-11");
    expect(cicloDaCompra(cartao, "2026-10-01").competencia).toBe("2026-10");
  });
  it("vira o ano nos dois sentidos", () => {
    expect(cicloDaCompra(cartao, "2026-12-30")).toEqual({
      competencia: "2027-01",
      inicioCiclo: "2026-12-26",
      fimCiclo: "2027-01-25",
      vencimento: "2027-02-05",
    });
    expect(cicloDaCompetencia(cartao, "2026-01").inicioCiclo).toBe("2025-12-26");
  });
  it("só aceita dia 1 a 28 (para existir em fevereiro)", () => {
    expect(diaValido(28)).toBe(true);
    expect(diaValido(29)).toBe(false);
    expect(diaValido(0)).toBe(false);
  });
  it("soma competência", () => {
    expect(somarCompetencia("2026-12", 1)).toBe("2027-01");
    expect(somarCompetencia("2026-01", -1)).toBe("2025-12");
  });
});

describe("situação da fatura", () => {
  const f = { fimCiclo: "2026-10-25" };
  it("aberta durante o ciclo, fechada depois, paga quando não sobra compra em aberto", () => {
    expect(situacaoDaFatura(f, { emAberto: 3, pagas: 0 }, "2026-10-25")).toBe("aberta");
    expect(situacaoDaFatura(f, { emAberto: 3, pagas: 0 }, "2026-10-26")).toBe("fechada");
    expect(situacaoDaFatura(f, { emAberto: 0, pagas: 3 }, "2026-12-01")).toBe("paga");
    expect(situacaoDaFatura(f, { emAberto: 0, pagas: 0 }, "2026-12-01")).toBe("vazia");
  });
  it("estornar uma compra reabre a fatura sozinho (não há estado gravado)", () => {
    expect(situacaoDaFatura(f, { emAberto: 1, pagas: 2 }, "2026-12-01")).toBe("fechada");
  });
  it("só paga fatura fechada, com compra em aberto", () => {
    expect(motivoParaNaoPagar(f, { emAberto: 3, pagas: 0 }, "2026-10-20")).toBe(MOTIVO_FATURA_ABERTA);
    expect(motivoParaNaoPagar(f, { emAberto: 0, pagas: 0 }, "2026-10-30")).toBe(MOTIVO_FATURA_VAZIA);
    expect(motivoParaNaoPagar(f, { emAberto: 0, pagas: 2 }, "2026-11-06")).toBe(MOTIVO_FATURA_PAGA);
    expect(motivoParaNaoPagar(f, { emAberto: 3, pagas: 0 }, "2026-10-30")).toBeNull();
  });
});

describe("parcelas", () => {
  it("divide em centavos com o resto na última e anda um mês por parcela", () => {
    const p = parcelasDaCompra(100_00, 3, "2026-10-14");
    expect(p.map((x) => x.valorCentavos)).toEqual([3333, 3333, 3334]);
    expect(p.map((x) => x.data)).toEqual(["2026-10-14", "2026-11-14", "2026-12-14"]);
    expect(p.reduce((s, x) => s + x.valorCentavos, 0)).toBe(100_00);
  });
  it("dia que o mês não tem cai no último dia", () => {
    expect(parcelasDaCompra(300_00, 3, "2026-01-31").map((x) => x.data)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });
  it("à vista é uma parcela e não muda a descrição", () => {
    const [p] = parcelasDaCompra(50_00, 1, "2026-10-14");
    expect(p).toEqual({ numero: 1, total: 1, valorCentavos: 50_00, data: "2026-10-14" });
    expect(descricaoDaParcela("Licença", p)).toBe("Licença");
    expect(descricaoDaParcela("Licença", { numero: 2, total: 3 })).toBe("Licença (2/3)");
  });
  it("recusa número de parcelas inválido", () => {
    expect(() => parcelasDaCompra(100, 0, "2026-10-14")).toThrow();
  });
});

describe("textos", () => {
  it("rótulo da competência e do evento no planejador", () => {
    expect(rotuloDaCompetencia("2026-10")).toBe("Outubro/2026");
    expect(rotuloDoEventoDaFatura({ nome: "Visa Empresarial", tipo: "empresa" }, "2026-10")).toBe("Fatura Visa Empresarial — outubro/2026");
    expect(rotuloDoEventoDaFatura({ nome: "Pessoal", tipo: "pessoal", nomeDoSocio: "Lúcio" }, "2026-10")).toBe("Reembolso a Lúcio — outubro/2026");
  });
});
