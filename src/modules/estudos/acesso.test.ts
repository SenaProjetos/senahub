import { describe, expect, it } from "vitest";

import { FERRAMENTAS } from "@/modules/ferramentas/registry";

import { FERRAMENTA_DO_ESTUDO, estudosLiberados, podeEditarEstudos, situacaoDoMotor } from "./acesso";

describe("estudosLiberados", () => {
  it("motor validado: liberado para todos, sem aviso", () => {
    expect(estudosLiberados("validada", false)).toEqual({ liberado: true, emValidacao: false });
    expect(estudosLiberados("nao_exige", false)).toEqual({ liberado: true, emValidacao: false });
  });

  it("motor em validação: só quem gere as ferramentas, com aviso", () => {
    expect(estudosLiberados("em_validacao", false)).toEqual({ liberado: false, emValidacao: true });
    expect(estudosLiberados("em_validacao", true)).toEqual({ liberado: true, emValidacao: true });
  });
});

describe("situacaoDoMotor", () => {
  it("segue o registro: a calculadora de corrente e demanda existe e exige validação", () => {
    const meta = FERRAMENTAS.find((f) => f.key === FERRAMENTA_DO_ESTUDO);
    expect(meta?.exigeValidacao).toBe(true);
    expect(["em_validacao", "validada"]).toContain(situacaoDoMotor());
  });
});

describe("podeEditarEstudos", () => {
  it("responsável de disciplina ou quem atua em disciplina alheia", () => {
    expect(podeEditarEstudos({ atuaEmDisciplinaAlheia: false, ehResponsavelDeDisciplina: true })).toBe(true);
    expect(podeEditarEstudos({ atuaEmDisciplinaAlheia: true, ehResponsavelDeDisciplina: false })).toBe(true);
  });

  it("quem só enxerga o projeto não escreve", () => {
    expect(podeEditarEstudos({ atuaEmDisciplinaAlheia: false, ehResponsavelDeDisciplina: false })).toBe(false);
  });
});
