import { describe, expect, it } from "vitest";
import { ACAO_ABRIR, ACAO_AVANCAR, ACAO_EXCLUIR, ACAO_INSERIR_ACIMA, ACAO_RECUAR } from "../acoes-eap";
import { MOTIVO_NIVEL_MAIS_ALTO, MOTIVO_SEM_IRMA_ACIMA } from "../arvore-eap";
import { MOTIVO_ULTIMA_LINHA } from "./edicao";
import { itensDeLinhaModelo } from "./acoes-modelo";

const linha = { nome: "Planta baixa", ehResumo: false, temIrmaAcima: true, irmaAcimaEMarco: false, nivel: 2, subtarefas: 0 };
const acoes = (itens: ReturnType<typeof itensDeLinhaModelo>) => itens.filter((i) => i.tipo === "acao");

describe("itensDeLinhaModelo", () => {
  it("quem edita: abrir, inserir, recuar, avançar e excluir — sem datas reais nem card", () => {
    const ids = acoes(itensDeLinhaModelo(linha, { podeEditar: true, totalLinhas: 10 })).map((i) => i.id);
    expect(ids).toEqual([ACAO_ABRIR, ACAO_INSERIR_ACIMA, ACAO_RECUAR, ACAO_AVANCAR, ACAO_EXCLUIR]);
  });

  it("quem só vê não tem menu", () => {
    expect(itensDeLinhaModelo(linha, { podeEditar: false, totalLinhas: 10 })).toEqual([]);
  });

  it("o estado da linha desabilita com a frase do motivo", () => {
    const itens = acoes(itensDeLinhaModelo({ ...linha, temIrmaAcima: false, nivel: 1 }, { podeEditar: true, totalLinhas: 10 }));
    const por = new Map(itens.map((i) => [i.id, i]));
    expect(por.get(ACAO_RECUAR)).toMatchObject({ desabilitado: MOTIVO_SEM_IRMA_ACIMA });
    expect(por.get(ACAO_AVANCAR)).toMatchObject({ desabilitado: MOTIVO_NIVEL_MAIS_ALTO });
  });

  it("excluir pede confirmação, conta as subtarefas e não apaga o modelo inteiro", () => {
    const comFilhas = acoes(itensDeLinhaModelo({ ...linha, subtarefas: 3 }, { podeEditar: true, totalLinhas: 10 })).find((i) => i.id === ACAO_EXCLUIR)!;
    expect(comFilhas.confirmar?.descricao).toContain("3 subtarefas");
    const tudo = acoes(itensDeLinhaModelo({ ...linha, subtarefas: 9 }, { podeEditar: true, totalLinhas: 10 })).find((i) => i.id === ACAO_EXCLUIR)!;
    expect(tudo.desabilitado).toBe(MOTIVO_ULTIMA_LINHA);
  });
});
