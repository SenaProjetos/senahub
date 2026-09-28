import { describe, expect, it } from "vitest";
import { validarTrocaContratacao, TETO_SEMANAL_HORAS } from "./troca-contratacao";

const base = {
  roleAtual: "clt" as const,
  contratacao: "clt" as const,
  cargaSemanal: 44,
  pjId: null,
  cpfPreenchido: false,
};

describe("validarTrocaContratacao", () => {
  it("recusa admin — sem eixo de contratação no modelo", () => {
    expect(validarTrocaContratacao({ ...base, roleAtual: "admin" })).toMatch(/Administradores/);
  });

  it("aceita não-admin dentro do teto", () => {
    expect(validarTrocaContratacao(base)).toBeNull();
  });

  describe("estágio — teto de 30h (Lei 11.788, art. 10, II)", () => {
    it("aceita exatamente 30h", () => {
      expect(validarTrocaContratacao({ ...base, contratacao: "estagio", cargaSemanal: 30 })).toBeNull();
    });
    it("recusa acima de 30h", () => {
      expect(validarTrocaContratacao({ ...base, contratacao: "estagio", cargaSemanal: 30.5 })).toMatch(/30h/);
    });
    it("recusa sem carga horária informada", () => {
      expect(validarTrocaContratacao({ ...base, contratacao: "estagio", cargaSemanal: null })).toMatch(
        /Informe a carga horária/,
      );
    });
  });

  describe("CLT — teto de 44h (CF, art. 7º, XIII)", () => {
    it("aceita exatamente 44h", () => {
      expect(validarTrocaContratacao({ ...base, contratacao: "clt", cargaSemanal: 44 })).toBeNull();
    });
    it("recusa acima de 44h", () => {
      expect(validarTrocaContratacao({ ...base, contratacao: "clt", cargaSemanal: 44.5 })).toMatch(/44h/);
    });
    it("recusa sem carga horária informada", () => {
      expect(validarTrocaContratacao({ ...base, contratacao: "clt", cargaSemanal: null })).toMatch(
        /Informe a carga horária/,
      );
    });
  });

  describe("PJ — exige pjId", () => {
    it("recusa sem pjId", () => {
      expect(validarTrocaContratacao({ ...base, contratacao: "pj", cargaSemanal: null, pjId: null })).toMatch(
        /pessoa jurídica/,
      );
    });
    it("aceita com pjId", () => {
      expect(validarTrocaContratacao({ ...base, contratacao: "pj", cargaSemanal: null, pjId: "pj-1" })).toBeNull();
    });
  });

  describe("autônomo/RPA — exige CPF", () => {
    it("recusa sem CPF preenchido", () => {
      expect(
        validarTrocaContratacao({ ...base, contratacao: "autonomo_rpa", cargaSemanal: null, cpfPreenchido: false }),
      ).toMatch(/CPF/);
    });
    it("aceita com CPF preenchido", () => {
      expect(
        validarTrocaContratacao({ ...base, contratacao: "autonomo_rpa", cargaSemanal: null, cpfPreenchido: true }),
      ).toBeNull();
    });
  });

  describe("pró-labore — sem validação de jornada", () => {
    it("aceita sem carga horária, sem pjId, sem CPF", () => {
      expect(
        validarTrocaContratacao({
          ...base,
          contratacao: "pro_labore",
          cargaSemanal: null,
          pjId: null,
          cpfPreenchido: false,
        }),
      ).toBeNull();
    });
  });

  it("TETO_SEMANAL_HORAS só define teto para estágio e CLT", () => {
    expect(Object.keys(TETO_SEMANAL_HORAS).sort()).toEqual(["clt", "estagio"]);
  });
});
