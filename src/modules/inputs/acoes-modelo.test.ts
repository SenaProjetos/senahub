import { describe, expect, it } from "vitest";
import { itensDaPerguntaDoModelo, itensDaSecaoDoModelo, itensDoModelo } from "./acoes-modelo";

const ids = (l: { id: string }[]) => l.map((i) => i.id);

describe("itensDoModelo", () => {
  it("sem permissão não há menu", () => {
    expect(itensDoModelo({ id: "a", padrao: false, ativo: true }, false)).toEqual([]);
  });

  it("o padrão não arquiva nem vira padrão de novo, com o motivo à vista", () => {
    const itens = itensDoModelo({ id: "a", padrao: true, ativo: true }, true);
    const padrao = itens.find((i) => i.id === "padrao");
    const arquivar = itens.find((i) => i.id === "arquivar");
    expect(padrao?.tipo === "acao" && padrao.desabilitado).toMatch(/já é o modelo padrão/);
    expect(arquivar?.tipo === "acao" && arquivar.desabilitado).toMatch(/não pode ser arquivado/);
  });

  it("arquivado oferece restaurar e não deixa virar padrão", () => {
    const itens = itensDoModelo({ id: "a", padrao: false, ativo: false }, true);
    expect(ids(itens)).toContain("restaurar");
    expect(ids(itens)).not.toContain("arquivar");
    const padrao = itens.find((i) => i.id === "padrao");
    expect(padrao?.tipo === "acao" && padrao.desabilitado).toMatch(/Restaure/);
  });
});

describe("itens do editor", () => {
  it("pergunta: mover só aparece havendo outra seção, e excluir confirma", () => {
    expect(ids(itensDaPerguntaDoModelo([]))).not.toContain("mover");
    const com = itensDaPerguntaDoModelo([{ id: "s2", titulo: "Dois" }]);
    const mover = com.find((i) => i.id === "mover");
    expect(mover?.tipo === "sub" && mover.itens[0].id).toBe("mover:s2");
    const excluir = com.find((i) => i.id === "excluir");
    expect(excluir?.tipo === "acao" && excluir.confirmar).toBeTruthy();
  });

  it("seção: a última não se exclui", () => {
    const [i] = itensDaSecaoDoModelo({ titulo: "Única", perguntas: 3 }, true);
    expect(i.tipo === "acao" && i.desabilitado).toMatch(/pelo menos uma seção/);
  });
});
