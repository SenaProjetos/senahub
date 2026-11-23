import { describe, expect, it } from "vitest";
import { chaveSoParaInterno, soParaInterno } from "./so-interno";
import { PERMISSOES_CATALOGO } from "./permissions-catalog";

describe("soParaInterno", () => {
  it("financeiro é só de interno, menos o extrato", () => {
    expect(soParaInterno("financeiro", "ver")).toBe(true);
    expect(soParaInterno("financeiro", "gerir")).toBe(true);
    expect(soParaInterno("financeiro", "extrato")).toBe(false);
  });

  it("toda ação do catálogo do financeiro, menos o extrato, exige interno", () => {
    const acoes = PERMISSOES_CATALOGO.find((r) => r.recurso === "financeiro")!.acoes.map((a) => a.acao);
    expect(acoes.length).toBeGreaterThan(1);
    expect(acoes.filter((a) => !soParaInterno("financeiro", a))).toEqual(["extrato"]);
  });

  it("outros recursos não mudam", () => {
    expect(soParaInterno("projetos", "ver")).toBe(false);
    expect(soParaInterno("suporte", "ver")).toBe(false);
  });

  it("chave do menu segue a mesma regra", () => {
    expect(chaveSoParaInterno("financeiro:ver")).toBe(true);
    expect(chaveSoParaInterno("financeiro:extrato")).toBe(false);
    expect(chaveSoParaInterno("projetos:ver")).toBe(false);
    expect(chaveSoParaInterno("financeiro")).toBe(false);
  });
});
