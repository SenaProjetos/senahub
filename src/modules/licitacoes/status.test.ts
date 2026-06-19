import { describe, it, expect } from "vitest";
import { transicaoPermitida, podeMedirLicitacao } from "./status";

describe("transicaoPermitida", () => {
  it("permite em_andamento → ganha", () => {
    expect(transicaoPermitida("em_andamento", "ganha")).toBe(true);
  });

  it("permite em_andamento → perdida", () => {
    expect(transicaoPermitida("em_andamento", "perdida")).toBe(true);
  });

  it("permite em_execucao → concluida", () => {
    expect(transicaoPermitida("em_execucao", "concluida")).toBe(true);
  });

  it("permite status igual (edição sem mudança de status)", () => {
    expect(transicaoPermitida("perdida", "perdida")).toBe(true);
    expect(transicaoPermitida("em_execucao", "em_execucao")).toBe(true);
  });

  it("rejeita ganha → em_execucao manual (só via importarLicitacao)", () => {
    expect(transicaoPermitida("ganha", "em_execucao")).toBe(false);
  });

  it("permite ganha → em_execucao quando viaImport", () => {
    expect(transicaoPermitida("ganha", "em_execucao", { viaImport: true })).toBe(true);
  });

  it("rejeita reabrir concluida → em_andamento", () => {
    expect(transicaoPermitida("concluida", "em_andamento")).toBe(false);
  });

  it("rejeita em_andamento → em_execucao (pular ganha)", () => {
    expect(transicaoPermitida("em_andamento", "em_execucao")).toBe(false);
  });

  it("rejeita em_andamento → concluida (pular etapas)", () => {
    expect(transicaoPermitida("em_andamento", "concluida")).toBe(false);
  });

  it("rejeita reabrir a partir de perdida", () => {
    expect(transicaoPermitida("perdida", "ganha")).toBe(false);
  });

  it("não libera transição de sistema fora do viaImport", () => {
    expect(transicaoPermitida("ganha", "em_execucao", { viaImport: false })).toBe(false);
  });
});

describe("podeMedirLicitacao", () => {
  it("permite em execução com projeto vinculado", () => {
    expect(podeMedirLicitacao({ status: "em_execucao", projetoId: "p1" })).toBe(true);
  });

  it("rejeita em execução sem projeto (estado inválido)", () => {
    expect(podeMedirLicitacao({ status: "em_execucao", projetoId: null })).toBe(false);
  });

  it("rejeita quando não está em execução", () => {
    expect(podeMedirLicitacao({ status: "ganha", projetoId: "p1" })).toBe(false);
  });
});
