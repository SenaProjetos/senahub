/**
 * Entrada (FCT, FCA, seção, mínima, neutro, proteção). Os esperados dos casos da planilha estão em
 * `casos-planilha.test.ts`; aqui só a comparação com a calculadora "Corrente e Demanda" (que não é alterada) e a
 * leitura da biblioteca (forma das chaves, não valores de norma).
 */

import { describe, expect, it } from "vitest";

import { FCT_TABELA, fatorAgrupamento } from "../electrical-demand";
import { NBR5410_TABELA_40, NBR5410_TABELA_41 } from "./biblioteca/nbr5410";
import {
  chaveContem,
  colunasDeCapacidade,
  fatorDeTemperatura,
  fcaDaTabela,
  fctDaTabela,
  formasDoMetodo,
  metodosDaLinha42,
  resistividadeDeReferencia,
  temperaturaDeReferencia,
} from "./entrada";

describe("igual à calculadora Corrente e Demanda (electrical-demand.ts)", () => {
  it("Tabela 40, PVC, ar: mesmo FCT em toda temperatura que ela lista", () => {
    for (const [t, v] of Object.entries(FCT_TABELA.PVC)) {
      expect(fctDaTabela({ isolacao: "PVC", meio: "ambiente", temperaturaC: Number(t) })).toBe(v);
    }
  });
  it("Tabela 40, EPR/XLPE, ar: mesmo FCT em toda temperatura que ela lista", () => {
    for (const [t, v] of Object.entries(FCT_TABELA.EPR)) {
      expect(fctDaTabela({ isolacao: "EPR_XLPE", meio: "ambiente", temperaturaC: Number(t) })).toBe(v);
    }
  });
  it("Tabela 42, linha 1: mesmo FCA de 1 a 30 circuitos", () => {
    for (let n = 1; n <= 30; n++) expect(fcaDaTabela({ forma: { tabela: "42", ref: 1 }, circuitos: n })).toBe(fatorAgrupamento(n));
  });
});

describe("leitura da biblioteca", () => {
  it("temperaturas de referência vêm das condições da Tabela 36 e batem com o título da Tabela 40", () => {
    expect(NBR5410_TABELA_40.titulo).toContain(`${temperaturaDeReferencia("ambiente")}ºC`);
    expect(NBR5410_TABELA_40.titulo).toContain(`${temperaturaDeReferencia("solo")}ºC`);
    expect(NBR5410_TABELA_40.linhas.some((l) => l.meio === "ambiente" && l.temperatura_C === temperaturaDeReferencia("ambiente"))).toBe(false);
  });
  it("resistividade de referência sai do título da Tabela 41 e não é linha da tabela", () => {
    const r = resistividadeDeReferencia();
    expect(r).not.toBeNull();
    expect(NBR5410_TABELA_41.linhas.some((l) => l.resistividade_K_m_W === r)).toBe(false);
  });
  it("chaves de contagem", () => {
    expect(chaveContem("9 a 11", 9)).toBe(true);
    expect(chaveContem("9 a 11", 12)).toBe(false);
    expect(chaveContem("4 ou 5", 5)).toBe(true);
    expect(chaveContem("≥20", 35)).toBe(true);
    expect(chaveContem("9 e mais", 9)).toBe(true);
    expect(chaveContem("3", 3)).toBe(true);
  });
  it("métodos da coluna da Tabela 42", () => {
    expect(metodosDaLinha42("36 a 39 (métodos A a F)")).toEqual(["A1", "A2", "B1", "B2", "C", "D", "E", "F"]);
    expect(metodosDaLinha42("36 e 37 (método C)")).toEqual(["C"]);
    expect(metodosDaLinha42("38 e 39 (métodos E e F)")).toEqual(["E", "F"]);
  });
  it("formas: B1 só a linha 1; G nenhuma (FCA digitado); D inclui Tabelas 44 e 45", () => {
    expect(formasDoMetodo("B1")).toEqual([{ tabela: "42", ref: 1 }]);
    expect(formasDoMetodo("G")).toEqual([]);
    const d = formasDoMetodo("D").map((f) => f.tabela);
    expect(d).toContain("44");
    expect(d).toContain("45");
  });
  it("colunas de capacidade: B1 PVC 2 condutores = uma coluna da Tabela 36; F 3 condutores tem mais de uma disposição", () => {
    const b1 = colunasDeCapacidade("B1", "PVC", 2);
    expect(b1.map((c) => [c.tabela.numero, c.coluna])).toEqual([["Tabela 36", "B1_2"]]);
    expect(colunasDeCapacidade("F", "EPR_XLPE", 3).length).toBeGreaterThan(1);
    expect(colunasDeCapacidade("A1", "EPR_XLPE", 3)[0].tabela.numero).toBe("Tabela 37");
  });
  it("FCT digitado vale quando a tabela não tem a temperatura", () => {
    const r = fatorDeTemperatura({ isolacao: "PVC", meio: "ambiente", temperaturaC: 65 }, { fct: 0.45 });
    expect(r.recusa).toBeNull();
    expect(r.fator.adotado).toBe(0.45);
  });
  it("linha enterrada avisa a coluna do solo", () => {
    const r = fatorDeTemperatura({ isolacao: "PVC", meio: "solo", temperaturaC: 25 });
    expect(r.avisos.map((a) => a.id)).toContain("linha_enterrada");
  });
});
