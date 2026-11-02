import { describe, it, expect } from "vitest";
import {
  ACAO_FURO_DUPLICAR,
  ACAO_FURO_REMOVER,
  MAX_FUROS_LISTA,
  MOTIVO_LISTA_CHEIA_FUROS,
  MOTIVO_ULTIMO_FURO,
  itensDeFuro,
} from "./acoes-furo";
import { MAX_FUROS } from "./calc/soil-infiltration";

function acao(itens: ReturnType<typeof itensDeFuro>, id: string) {
  const item = itens.find((i) => i.id === id);
  if (!item || item.tipo !== "acao") throw new Error(`sem ação ${id}`);
  return item;
}

describe("itensDeFuro", () => {
  it("lista do meio: duplicar e remover habilitados", () => {
    const itens = itensDeFuro({ total: 3 });
    expect(acao(itens, ACAO_FURO_DUPLICAR).desabilitado).toBeUndefined();
    expect(acao(itens, ACAO_FURO_REMOVER).desabilitado).toBeUndefined();
  });

  it("o último furo restante não pode ser removido, com o motivo à vista", () => {
    expect(acao(itensDeFuro({ total: 1 }), ACAO_FURO_REMOVER).desabilitado).toBe(MOTIVO_ULTIMO_FURO);
  });

  it("lista cheia não duplica", () => {
    expect(acao(itensDeFuro({ total: MAX_FUROS_LISTA }), ACAO_FURO_DUPLICAR).desabilitado).toBe(MOTIVO_LISTA_CHEIA_FUROS);
  });

  it("remover é destrutivo e pede confirmação", () => {
    const remover = acao(itensDeFuro({ total: 2 }), ACAO_FURO_REMOVER);
    expect(remover.variant).toBe("destructive");
    expect(remover.confirmar).toBeDefined();
  });

  it("o teto da lista é o do esquema", () => {
    expect(MAX_FUROS_LISTA).toBe(MAX_FUROS);
  });
});
