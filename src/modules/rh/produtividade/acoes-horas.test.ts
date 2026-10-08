import { describe, expect, it } from "vitest";
import {
  ACAO_COMPARAR,
  ACAO_ESPELHO,
  ACAO_POR_PROJETO,
  ACAO_TIRAR,
  itensDoRankingDeHoras,
  LIMITE_COMPARACAO,
  MOTIVO_LIMITE_COMPARACAO,
  selecaoVisivel,
} from "./acoes-horas";

const base = { userId: "u 1", selecionado: false, totalSelecionados: 0, podeVerEspelho: true };
const ids = (itens: { id: string }[]) => itens.map((i) => i.id);

describe("itensDoRankingDeHoras", () => {
  it("não selecionado: Comparar, Ver por projeto, Espelho", () => {
    expect(ids(itensDoRankingDeHoras(base))).toEqual([ACAO_COMPARAR, ACAO_POR_PROJETO, ACAO_ESPELHO]);
  });
  it("selecionado troca Comparar por Tirar da comparação", () => {
    expect(ids(itensDoRankingDeHoras({ ...base, selecionado: true, totalSelecionados: 1 }))[0]).toBe(ACAO_TIRAR);
  });
  it(`no limite de ${LIMITE_COMPARACAO}, Comparar fica desabilitado com o motivo`, () => {
    const item = itensDoRankingDeHoras({ ...base, totalSelecionados: LIMITE_COMPARACAO })[0];
    expect(item).toMatchObject({ id: ACAO_COMPARAR, desabilitado: MOTIVO_LIMITE_COMPARACAO });
  });
  it("Tirar nunca é bloqueado pelo limite", () => {
    const item = itensDoRankingDeHoras({ ...base, selecionado: true, totalSelecionados: LIMITE_COMPARACAO })[0];
    expect(item).toMatchObject({ id: ACAO_TIRAR });
    expect("desabilitado" in item && item.desabilitado).toBeFalsy();
  });
  it("sem ponto:espelho_equipe o item do espelho é omitido (não desabilitado)", () => {
    expect(ids(itensDoRankingDeHoras({ ...base, podeVerEspelho: false }))).not.toContain(ACAO_ESPELHO);
  });
  it("espelho é link com o usuário codificado", () => {
    const item = itensDoRankingDeHoras(base).find((i) => i.id === ACAO_ESPELHO);
    expect(item).toMatchObject({ tipo: "link", href: "/ponto/espelho?u=u%201" });
  });
});

describe("selecaoVisivel", () => {
  it("quem saiu do ranking (0h no novo período) deixa de ocupar vaga e cor", () => {
    // comparava 5; no mês anterior b e d não têm horas
    expect(selecaoVisivel(["a", "b", "c", "d", "e"], ["a", "c", "e", "f"])).toEqual(["a", "c", "e"]);
  });
  it("mantém a ordem da seleção (é a ordem das cores)", () => {
    expect(selecaoVisivel(["c", "a"], ["a", "b", "c"])).toEqual(["c", "a"]);
  });
});
