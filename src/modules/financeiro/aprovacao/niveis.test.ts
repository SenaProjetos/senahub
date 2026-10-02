import { describe, it, expect } from "vitest";
import { faixaPara, precisaAprovacao, papeisAprovadores, type FaixaAlcada } from "./niveis";

const faixas: FaixaAlcada[] = [
  { ate: 5000, papeis: [] },
  { ate: 20000, papeis: ["administrativo"] },
  { ate: null, papeis: ["supervisor", "admin"] },
];

describe("faixaPara", () => {
  it("escolhe a faixa de menor teto que cobre o valor", () => {
    expect(faixaPara(3000, faixas)?.ate).toBe(5000);
    expect(faixaPara(10000, faixas)?.ate).toBe(20000);
    expect(faixaPara(50000, faixas)?.ate).toBeNull();
  });
  it("valor igual ao teto cai na própria faixa", () => {
    expect(faixaPara(5000, faixas)?.ate).toBe(5000);
  });
});

describe("precisaAprovacao", () => {
  it("receita nunca precisa", () => {
    expect(precisaAprovacao("receita", 99999, faixas)).toBe(false);
  });
  it("despesa abaixo do 1º teto é automática", () => {
    expect(precisaAprovacao("despesa", 3000, faixas)).toBe(false);
  });
  it("despesa em faixa com papéis precisa", () => {
    expect(precisaAprovacao("despesa", 10000, faixas)).toBe(true);
    expect(precisaAprovacao("despesa", 50000, faixas)).toBe(true);
  });
});

describe("papeisAprovadores", () => {
  it("retorna os papéis da faixa", () => {
    expect(papeisAprovadores(10000, faixas)).toEqual(["administrativo"]);
    expect(papeisAprovadores(50000, faixas)).toEqual(["supervisor", "admin"]);
    expect(papeisAprovadores(3000, faixas)).toEqual([]);
  });
});

import { MOTIVO_PROPRIA_DESPESA, MOTIVO_SEM_ALCADA, motivoParaNaoAprovar, situacaoAposMudarValor, valorDaAlcada } from "./niveis";

describe("alçada única (N3)", () => {
  const faixas = [
    { ate: 1000, papeis: [] },
    { ate: 10000, papeis: ["supervisor", "administrativo"] },
    { ate: null, papeis: ["admin"] },
  ];
  it("total do parcelamento: 60 × 900 é avaliado como 54.000", () => {
    expect(valorDaAlcada(900, 60)).toBe(54000);
    expect(valorDaAlcada(0.1, 3)).toBe(0.3);
    expect(valorDaAlcada(500)).toBe(500);
  });
  it("faixa inclui o teto: R$ 1.000 é automático, R$ 1.000,01 não", () => {
    expect(situacaoAposMudarValor({ tipo: "despesa", status: "previsto", valorAlcada: 1000, faixas })).toBeNull();
    expect(situacaoAposMudarValor({ tipo: "despesa", status: "previsto", valorAlcada: 1000.01, faixas })).toBe("aguardando_aprovacao");
  });
  it("valor que cai abaixo da faixa libera; receita e pago não mudam", () => {
    expect(situacaoAposMudarValor({ tipo: "despesa", status: "aguardando_aprovacao", valorAlcada: 500, faixas })).toBe("previsto");
    expect(situacaoAposMudarValor({ tipo: "receita", status: "previsto", valorAlcada: 99999, faixas })).toBeNull();
    expect(situacaoAposMudarValor({ tipo: "despesa", status: "confirmado", valorAlcada: 99999, faixas })).toBeNull();
  });
  it("autoaprovação só do admin; papel fora da faixa não aprova", () => {
    const base = { valorAlcada: 5000, faixas, autorId: "u1" };
    expect(motivoParaNaoAprovar({ ...base, aprovador: { id: "u1", role: "supervisor" } })).toBe(MOTIVO_PROPRIA_DESPESA);
    expect(motivoParaNaoAprovar({ ...base, aprovador: { id: "u1", role: "admin" } })).toBeNull();
    expect(motivoParaNaoAprovar({ ...base, aprovador: { id: "u2", role: "supervisor" } })).toBeNull();
    expect(motivoParaNaoAprovar({ ...base, valorAlcada: 20000, aprovador: { id: "u2", role: "supervisor" } })).toBe(MOTIVO_SEM_ALCADA);
  });
});
