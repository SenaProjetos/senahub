import { describe, it, expect } from "vitest";
import { calcularEbitda, variacaoHorizontal, analisarDRE, type LinhaBaseDRE } from "./dre";

const periodo = { de: "2026-02-01", ate: "2026-02-28", deAnt: "2026-01-01", ateAnt: "2026-01-31" };

describe("calcularEbitda", () => {
  it("considera só categorias operacionais (null = operacional)", () => {
    const linhas: LinhaBaseDRE[] = [
      { codigo: "1", nome: "Serviços", tipo: "receita", grupoDfc: "operacional", valor: 1000 },
      { codigo: "2", nome: "Salários", tipo: "despesa", grupoDfc: null, valor: 300 },
      { codigo: "3", nome: "Juros", tipo: "despesa", grupoDfc: "financiamento", valor: 200 },
    ];
    // 1000 − 300 = 700 (juros de financiamento ficam de fora)
    expect(calcularEbitda(linhas)).toBe(700);
  });
});

describe("variacaoHorizontal", () => {
  it("calcula variação percentual", () => {
    expect(variacaoHorizontal(150, 100)).toBe(50);
    expect(variacaoHorizontal(80, 100)).toBeCloseTo(-20);
  });
  it("retorna null sem base anterior", () => {
    expect(variacaoHorizontal(100, 0)).toBeNull();
  });
});

describe("analisarDRE", () => {
  const atuais: LinhaBaseDRE[] = [
    { codigo: "1.01", nome: "Projetos", tipo: "receita", grupoDfc: "operacional", valor: 2000 },
    { codigo: "2.01", nome: "Projetistas", tipo: "despesa", grupoDfc: "operacional", valor: 500 },
  ];
  const anteriores: LinhaBaseDRE[] = [
    { codigo: "1.01", nome: "Projetos", tipo: "receita", grupoDfc: "operacional", valor: 1000 },
    { codigo: "2.01", nome: "Projetistas", tipo: "despesa", grupoDfc: "operacional", valor: 400 },
  ];

  it("totais e ebitda do período atual", () => {
    const r = analisarDRE(atuais, anteriores, periodo);
    expect(r.totalReceitas).toBe(2000);
    expect(r.totalDespesas).toBe(500);
    expect(r.resultado).toBe(1500);
    expect(r.ebitda).toBe(1500);
    expect(r.anterior.resultado).toBe(600);
  });

  it("AV = % sobre receita total", () => {
    const r = analisarDRE(atuais, anteriores, periodo);
    expect(r.receitas[0].av).toBeCloseTo(100); // 2000/2000
    expect(r.despesas[0].av).toBeCloseTo(25); // 500/2000
  });

  it("AH = variação vs. anterior por código", () => {
    const r = analisarDRE(atuais, anteriores, periodo);
    expect(r.receitas[0].ah).toBeCloseTo(100); // 1000 → 2000
    expect(r.despesas[0].ah).toBeCloseTo(25); // 400 → 500
  });

  it("AH null quando categoria nova (sem anterior)", () => {
    const r = analisarDRE(
      [{ codigo: "9.99", nome: "Nova", tipo: "receita", valor: 100 }],
      [],
      periodo,
    );
    expect(r.receitas[0].ah).toBeNull();
  });
});
