import { describe, expect, it } from "vitest";
import { ehGlobal, podeEscreverNoDiario, podeGerirEntrada } from "./acesso";

describe("diario/acesso", () => {
  it("ehGlobal reconhece admin e supervisor", () => {
    expect(ehGlobal("admin")).toBe(true);
    expect(ehGlobal("supervisor")).toBe(true);
    expect(ehGlobal("projetista_pj")).toBe(false);
    expect(ehGlobal("cliente")).toBe(false);
  });

  describe("podeEscreverNoDiario", () => {
    it("responsável da disciplina escreve", () => {
      expect(podeEscreverNoDiario({ role: "projetista_pj", ehResponsavelDaDisciplina: true })).toBe(true);
    });
    it("não-responsável comum não escreve", () => {
      expect(podeEscreverNoDiario({ role: "projetista_pj", ehResponsavelDaDisciplina: false })).toBe(false);
    });
    it("global escreve mesmo sem ser responsável", () => {
      expect(podeEscreverNoDiario({ role: "admin", ehResponsavelDaDisciplina: false })).toBe(true);
      expect(podeEscreverNoDiario({ role: "supervisor", ehResponsavelDaDisciplina: false })).toBe(true);
    });
  });

  describe("podeGerirEntrada", () => {
    it("autor edita/exclui a própria entrada", () => {
      expect(podeGerirEntrada({ userId: "u1", role: "projetista_pj", autorId: "u1" })).toBe(true);
    });
    it("outro projetista não mexe na entrada alheia", () => {
      expect(podeGerirEntrada({ userId: "u2", role: "projetista_pj", autorId: "u1" })).toBe(false);
    });
    it("global gerencia qualquer entrada", () => {
      expect(podeGerirEntrada({ userId: "u2", role: "admin", autorId: "u1" })).toBe(true);
    });
  });
});
