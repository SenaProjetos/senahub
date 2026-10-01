import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { camposDoPlanejador, saldoRestante } from "./parcial";

describe("camposDoPlanejador — o resto do parcial é o mesmo compromisso (spec §5e)", () => {
  it("copia prioridade, confiança, par de transferência e caixinha", () => {
    expect(camposDoPlanejador({ prioridade: "p2", confianca: "confirmada_cliente", transferenciaId: "t1", caixinhaId: "cx" })).toEqual({
      prioridade: "p2",
      confianca: "confirmada_cliente",
      transferenciaId: "t1",
      caixinhaId: "cx",
    });
  });
  it("ausentes viram null e nada além desses campos é copiado", () => {
    const r = camposDoPlanejador({ ...({ valor: 10, status: "confirmado" } as object) });
    expect(r).toEqual({ prioridade: null, confianca: null, transferenciaId: null, caixinhaId: null });
  });
  it("os dois lugares que criam o resto do parcial usam o helper", () => {
    const raiz = join(__dirname, "..");
    for (const arq of ["lancamentos/actions.ts", "planejamento/actions.ts"]) {
      const fonte = readFileSync(join(raiz, arq), "utf8");
      expect(fonte.match(/\.\.\.camposDoPlanejador\(lanc\)/g)?.length ?? 0, arq).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("saldoRestante", () => {
  it("retorna a diferença num pagamento parcial", () => {
    expect(saldoRestante(20000, 5000)).toBe(15000);
    expect(saldoRestante(100.5, 40.25)).toBe(60.25);
  });
  it("null quando paga o total", () => {
    expect(saldoRestante(20000, 20000)).toBeNull();
  });
  it("null quando paga mais que o total", () => {
    expect(saldoRestante(20000, 25000)).toBeNull();
  });
  it("null quando não informa valor efetivo", () => {
    expect(saldoRestante(20000, null)).toBeNull();
    expect(saldoRestante(20000, undefined)).toBeNull();
  });
  it("ignora diferença menor que um centavo", () => {
    expect(saldoRestante(100, 99.999)).toBeNull();
  });
  it("arredonda a centavos", () => {
    expect(saldoRestante(10, 3.333)).toBe(6.67);
  });
});
