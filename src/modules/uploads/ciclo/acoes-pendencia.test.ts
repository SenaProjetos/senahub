import { describe, expect, it } from "vitest";
import { MOTIVO_NAO_DISPENSAVEL } from "./pendencias";
import { itensDaSelecaoDePendencias, itensDePendenciaCiclo } from "./acoes-pendencia";

const base = { dispensada: false, hrefDocumento: "/projetos/p1/arquivos?disciplinaId=d1", hrefLixeira: "/projetos/p1/arquivos?area=lixeira" };
const ids = (xs: ReturnType<typeof itensDePendenciaCiclo>) => xs.map((x) => x.id);

describe("itensDePendenciaCiclo", () => {
  it("lixeira aberta: documento, lixeira do projeto e dispensar", () => {
    const itens = itensDePendenciaCiclo({ ...base, tipo: "publicada_com_lixeira" });
    expect(ids(itens)).toEqual(["abrir-documento", "abrir-lixeira", "sep-dispensa", "dispensar"]);
    expect(itens[0]).toMatchObject({ tipo: "link", href: base.hrefDocumento });
    expect(itens[1]).toMatchObject({ tipo: "link", href: base.hrefLixeira });
    expect(itens[3]).toMatchObject({ tipo: "acao", id: "dispensar" });
    expect(itens[3]).not.toHaveProperty("desabilitado");
  });

  it("só a lixeira oferece abrir a lixeira", () => {
    expect(ids(itensDePendenciaCiclo({ ...base, tipo: "analise_parada" }))).toEqual(["abrir-documento", "sep-dispensa", "dispensar"]);
    expect(ids(itensDePendenciaCiclo({ ...base, tipo: "duas_publicadas" }))).toEqual(["abrir-documento", "sep-dispensa", "dispensar"]);
  });

  it("dispensada: o item vira desfazer dispensa", () => {
    expect(ids(itensDePendenciaCiclo({ ...base, tipo: "analise_parada", dispensada: true }))).toEqual([
      "abrir-documento",
      "sep-dispensa",
      "desfazer-dispensa",
    ]);
  });

  it("corrigida automaticamente: dispensar vem desabilitado com a frase do servidor", () => {
    const itens = itensDePendenciaCiclo({ ...base, tipo: "corrigida" });
    expect(itens.find((i) => i.id === "dispensar")).toMatchObject({ desabilitado: MOTIVO_NAO_DISPENSAVEL });
  });
});

describe("itensDaSelecaoDePendencias", () => {
  it("a barra de lote só dispensa", () => {
    expect(itensDaSelecaoDePendencias().map((i) => i.id)).toEqual(["dispensar"]);
  });
});
