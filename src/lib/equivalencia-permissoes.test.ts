import { describe, it, expect } from "vitest";
import { compararPermissoes, type CelulaPermissao } from "./equivalencia-permissoes";

function celula(over: Partial<CelulaPermissao> = {}): CelulaPermissao {
  return { userId: "u1", role: "clt", recurso: "financeiro", acao: "ver", permitido: false, ...over };
}

describe("compararPermissoes", () => {
  it("nenhuma diferença quando as duas matrizes são idênticas", () => {
    const antes = [celula({ permitido: true }), celula({ acao: "gerir", permitido: false })];
    const depois = [celula({ permitido: true }), celula({ acao: "gerir", permitido: false })];
    expect(compararPermissoes(antes, depois)).toEqual({ ganhos: [], perdas: [] });
  });

  it("detecta um GANHO (false→true) — o caso que a migração não pode produzir", () => {
    const antes = [celula({ permitido: false })];
    const depois = [celula({ permitido: true })];
    const r = compararPermissoes(antes, depois);
    expect(r.ganhos).toHaveLength(1);
    expect(r.ganhos[0]).toMatchObject({ antes: false, depois: true, recurso: "financeiro", acao: "ver" });
    expect(r.perdas).toHaveLength(0);
  });

  it("detecta uma PERDA (true→false) — warning, não falha", () => {
    const antes = [celula({ permitido: true })];
    const depois = [celula({ permitido: false })];
    const r = compararPermissoes(antes, depois);
    expect(r.perdas).toHaveLength(1);
    expect(r.perdas[0]).toMatchObject({ antes: true, depois: false });
    expect(r.ganhos).toHaveLength(0);
  });

  it("célula ausente em 'depois' conta como negada — não é erro, é o default dos dois motores", () => {
    const antes = [celula({ permitido: true })];
    const r = compararPermissoes(antes, []);
    expect(r.perdas).toHaveLength(1);
    expect(r.perdas[0].depois).toBe(false);
  });

  it("célula ausente em 'antes' é ignorada — só compara o que existia antes", () => {
    const depois = [celula({ permitido: true })];
    expect(compararPermissoes([], depois)).toEqual({ ganhos: [], perdas: [] });
  });

  it("distingue usuários e pares recurso:acao independentemente", () => {
    const antes = [
      celula({ userId: "u1", permitido: true }),
      celula({ userId: "u2", permitido: false }),
      celula({ userId: "u1", acao: "gerir", permitido: false }),
    ];
    const depois = [
      celula({ userId: "u1", permitido: true }), // igual
      celula({ userId: "u2", permitido: false }), // igual
      celula({ userId: "u1", acao: "gerir", permitido: true }), // ganho
    ];
    const r = compararPermissoes(antes, depois);
    expect(r.ganhos).toHaveLength(1);
    expect(r.ganhos[0]).toMatchObject({ userId: "u1", acao: "gerir" });
    expect(r.perdas).toHaveLength(0);
  });

  it("matrizes vazias não geram diferença", () => {
    expect(compararPermissoes([], [])).toEqual({ ganhos: [], perdas: [] });
  });
});
