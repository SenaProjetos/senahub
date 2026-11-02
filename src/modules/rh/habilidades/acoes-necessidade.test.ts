import { describe, expect, it } from "vitest";

import { ACAO_NECESSIDADE_EDITAR, ACAO_NECESSIDADE_REMOVER, itensDeNecessidade } from "./acoes-necessidade";

describe("itensDeNecessidade", () => {
  it("quem edita o projeto: alterar e remover (com confirmação)", () => {
    const itens = itensDeNecessidade({ podeEditar: true, competencia: "Revit" });
    expect(itens.map((i) => i.id)).toEqual([ACAO_NECESSIDADE_EDITAR, "sep-remover", ACAO_NECESSIDADE_REMOVER]);
    const remover = itens.find((i) => i.id === ACAO_NECESSIDADE_REMOVER);
    expect(remover?.tipo === "acao" && remover.variant).toBe("destructive");
    expect(remover?.tipo === "acao" && remover.confirmar?.titulo).toContain("Revit");
  });

  it("quem só lê: nenhum item (a linha fica sem menu)", () => {
    expect(itensDeNecessidade({ podeEditar: false, competencia: "Revit" })).toEqual([]);
  });
});
