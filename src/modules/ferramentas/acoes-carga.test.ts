import { describe, it, expect } from "vitest";
import {
  ACAO_CARGA_DESCER,
  ACAO_CARGA_DUPLICAR,
  ACAO_CARGA_REMOVER,
  ACAO_CARGA_SUBIR,
  MAX_CARGAS,
  MOTIVO_LISTA_CHEIA,
  MOTIVO_PRIMEIRA,
  MOTIVO_ULTIMA,
  MOTIVO_ULTIMA_CARGA,
  itensDeCarga,
  moverItem,
} from "./acoes-carga";

function acao(itens: ReturnType<typeof itensDeCarga>, id: string) {
  const item = itens.find((i) => i.id === id);
  if (!item || item.tipo !== "acao") throw new Error(`sem ação ${id}`);
  return item;
}

describe("itensDeCarga", () => {
  it("linha do meio: tudo habilitado", () => {
    const itens = itensDeCarga({ indice: 1, total: 3 });
    for (const id of [ACAO_CARGA_DUPLICAR, ACAO_CARGA_SUBIR, ACAO_CARGA_DESCER, ACAO_CARGA_REMOVER]) {
      expect(acao(itens, id).desabilitado).toBeUndefined();
    }
  });

  it("primeira linha não sobe; última não desce — com o motivo à vista", () => {
    expect(acao(itensDeCarga({ indice: 0, total: 3 }), ACAO_CARGA_SUBIR).desabilitado).toBe(MOTIVO_PRIMEIRA);
    expect(acao(itensDeCarga({ indice: 2, total: 3 }), ACAO_CARGA_DESCER).desabilitado).toBe(MOTIVO_ULTIMA);
  });

  it("a última carga restante não pode ser removida", () => {
    expect(acao(itensDeCarga({ indice: 0, total: 1 }), ACAO_CARGA_REMOVER).desabilitado).toBe(MOTIVO_ULTIMA_CARGA);
  });

  it("lista cheia não duplica", () => {
    expect(acao(itensDeCarga({ indice: 0, total: MAX_CARGAS }), ACAO_CARGA_DUPLICAR).desabilitado).toBe(MOTIVO_LISTA_CHEIA);
  });

  it("remover é destrutivo e pede confirmação", () => {
    const remover = acao(itensDeCarga({ indice: 0, total: 2 }), ACAO_CARGA_REMOVER);
    expect(remover.variant).toBe("destructive");
    expect(remover.confirmar).toBeDefined();
  });
});

describe("moverItem", () => {
  it("move para cima e para baixo sem mutar a lista original", () => {
    const base = ["a", "b", "c"];
    expect(moverItem(base, 2, 0)).toEqual(["c", "a", "b"]);
    expect(moverItem(base, 0, 1)).toEqual(["b", "a", "c"]);
    expect(base).toEqual(["a", "b", "c"]);
  });

  it("índice fora da lista não muda nada", () => {
    expect(moverItem(["a", "b"], 0, 5)).toEqual(["a", "b"]);
    expect(moverItem(["a", "b"], -1, 0)).toEqual(["a", "b"]);
  });
});
