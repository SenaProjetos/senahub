import { describe, expect, it } from "vitest";
import { itensDaMensagem } from "./acoes";

const semMarca = { decisao: null };
const marcada = { decisao: { resumo: "Fachada em ACM cinza.", marcadaPor: "Ana", marcadaEm: "2026-11-21T10:00:00.000Z" } };

describe("itensDaMensagem", () => {
  it("sem permissão de decidir não há itens", () => {
    expect(itensDaMensagem(semMarca, { podeDecidir: false })).toEqual([]);
    expect(itensDaMensagem(marcada, { podeDecidir: false })).toEqual([]);
  });

  it("mensagem sem marca oferece marcar", () => {
    const itens = itensDaMensagem(semMarca, { podeDecidir: true });
    expect(itens.map((i) => i.id)).toEqual(["marcar-decisao"]);
    expect(itens[0]).toMatchObject({ tipo: "acao", rotulo: "Marcar como decisão do cliente" });
  });

  it("mensagem marcada oferece remover", () => {
    const itens = itensDaMensagem(marcada, { podeDecidir: true });
    expect(itens.map((i) => i.id)).toEqual(["remover-decisao"]);
    expect(itens[0]).toMatchObject({ tipo: "acao", rotulo: "Remover marca de decisão", variant: "destructive" });
    expect(itens[0]).toHaveProperty("confirmar.titulo");
  });
});
