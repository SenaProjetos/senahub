import { describe, expect, it } from "vitest";
import { podeEscreverNoDiario, podeGerirEntrada } from "./acesso";

describe("diario/acesso", () => {
  describe("podeEscreverNoDiario", () => {
    it("responsável da disciplina escreve", () => {
      expect(podeEscreverNoDiario({ atuaEmDisciplinaAlheia: false, ehResponsavelDaDisciplina: true })).toBe(true);
    });
    it("não-responsável comum não escreve", () => {
      expect(podeEscreverNoDiario({ atuaEmDisciplinaAlheia: false, ehResponsavelDaDisciplina: false })).toBe(false);
    });
    it("quem atua em disciplina alheia escreve mesmo sem ser responsável", () => {
      expect(podeEscreverNoDiario({ atuaEmDisciplinaAlheia: true, ehResponsavelDaDisciplina: false })).toBe(true);
    });
  });

  describe("podeGerirEntrada", () => {
    it("autor edita/exclui a própria entrada", () => {
      expect(podeGerirEntrada({ userId: "u1", atuaEmDisciplinaAlheia: false, autorId: "u1" })).toBe(true);
    });
    it("outra pessoa não mexe na entrada alheia", () => {
      expect(podeGerirEntrada({ userId: "u2", atuaEmDisciplinaAlheia: false, autorId: "u1" })).toBe(false);
    });
    it("quem atua em disciplina alheia gerencia qualquer entrada", () => {
      expect(podeGerirEntrada({ userId: "u2", atuaEmDisciplinaAlheia: true, autorId: "u1" })).toBe(true);
    });
  });
});
