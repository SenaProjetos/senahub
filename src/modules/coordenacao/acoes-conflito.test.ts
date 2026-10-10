import { describe, expect, it } from "vitest";

import {
  ACAO_APONTAR_CONFLITO,
  ACAO_FOCAR_CONFLITO,
  ACAO_IGNORAR_COMBINACAO,
  MOTIVO_APONTANDO,
  itensDoConflito,
} from "./acoes-conflito";

const laje = { categoriaA: "IFCSLAB", categoriaB: "IFCBEAM" };
const ids = (itens: { id?: string }[]) => itens.map((i) => i.id);

describe("itensDoConflito", () => {
  it("quem gere vê focar, apontar e ignorar a combinação", () => {
    const itens = itensDoConflito(laje, { podeApontar: true, apontando: false });
    expect(ids(itens)).toEqual([ACAO_FOCAR_CONFLITO, ACAO_APONTAR_CONFLITO, ACAO_IGNORAR_COMBINACAO]);
    expect(itens.find((i) => i.id === ACAO_IGNORAR_COMBINACAO)).toMatchObject({ rotulo: "Ignorar Laje × Viga" });
  });

  it("sem permissão de gerir, apontar some (não aparece desabilitado)", () => {
    expect(ids(itensDoConflito(laje, { podeApontar: false, apontando: false }))).toEqual([
      ACAO_FOCAR_CONFLITO,
      ACAO_IGNORAR_COMBINACAO,
    ]);
  });

  it("enquanto um apontamento é criado, apontar fica inerte com o motivo", () => {
    const itens = itensDoConflito(laje, { podeApontar: true, apontando: true });
    expect(itens.find((i) => i.id === ACAO_APONTAR_CONFLITO)).toMatchObject({ desabilitado: MOTIVO_APONTANDO });
  });
});
