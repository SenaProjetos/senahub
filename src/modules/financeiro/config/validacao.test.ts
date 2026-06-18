import { describe, it, expect } from "vitest";
import { obrigatorioFaltando, type CamposObrigatorios } from "./validacao";

const nada: CamposObrigatorios = { centro: false, forma: false, projeto: false, contato: false, observacao: false };

describe("obrigatorioFaltando", () => {
  it("null quando nada é obrigatório", () => {
    expect(obrigatorioFaltando(nada, { tipo: "despesa" })).toBeNull();
  });
  it("acusa centro ausente", () => {
    expect(obrigatorioFaltando({ ...nada, centro: true }, { tipo: "despesa" })).toBe("Centro de custo");
  });
  it("contato pede fornecedor em despesa e cliente em receita", () => {
    expect(obrigatorioFaltando({ ...nada, contato: true }, { tipo: "despesa" })).toBe("Fornecedor");
    expect(obrigatorioFaltando({ ...nada, contato: true }, { tipo: "receita" })).toBe("Cliente");
    expect(obrigatorioFaltando({ ...nada, contato: true }, { tipo: "despesa", fornecedorId: "x" })).toBeNull();
  });
  it("observação só passa com texto não vazio", () => {
    expect(obrigatorioFaltando({ ...nada, observacao: true }, { tipo: "despesa", observacao: "  " })).toBe("Observação");
    expect(obrigatorioFaltando({ ...nada, observacao: true }, { tipo: "despesa", observacao: "ok" })).toBeNull();
  });
  it("passa quando todos os obrigatórios estão preenchidos", () => {
    const todos: CamposObrigatorios = { centro: true, forma: true, projeto: true, contato: true, observacao: true };
    expect(
      obrigatorioFaltando(todos, {
        tipo: "despesa",
        centroId: "c",
        formaId: "f",
        projetoId: "p",
        fornecedorId: "for",
        observacao: "obs",
      }),
    ).toBeNull();
  });
});
