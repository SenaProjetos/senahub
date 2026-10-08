import { describe, expect, it } from "vitest";

import {
  SELECAO_ADICIONAR_LISTA,
  SELECAO_ALTERAR_STATUS,
  SELECAO_BAIXAR,
  SELECAO_EXCLUIR,
  SELECAO_LINK_PUBLICO,
  SELECAO_REMOVER_LISTA,
  SELECAO_VALIDAR,
  itensDaSelecaoDeDocumentos,
  type ContextoSelecaoDocumentos,
} from "./acoes-selecao-documentos";

const tudo: ContextoSelecaoDocumentos = {
  totalDocumentos: 3,
  totalValidaveis: 2,
  podeValidar: true,
  totalStatusAlteravel: 3,
  podeExcluir: true,
  podeGerirListas: true,
  temListas: true,
  listaAberta: true,
  podeGerirLink: true,
};

const ids = (itens: { id: string; tipo: string }[]) => itens.filter((i) => i.tipo !== "separador").map((i) => i.id);

describe("itensDaSelecaoDeDocumentos", () => {
  it("lista as ações da seleção, com excluir por último", () => {
    expect(ids(itensDaSelecaoDeDocumentos(tudo))).toEqual([
      SELECAO_BAIXAR,
      SELECAO_VALIDAR,
      SELECAO_ALTERAR_STATUS,
      SELECAO_ADICIONAR_LISTA,
      SELECAO_REMOVER_LISTA,
      SELECAO_LINK_PUBLICO,
      SELECAO_EXCLUIR,
    ]);
  });

  it("omite o que o perfil ou a tela não permitem", () => {
    const itens = itensDaSelecaoDeDocumentos({
      ...tudo,
      podeValidar: false,
      totalStatusAlteravel: 0,
      podeExcluir: false,
      temListas: false,
      listaAberta: false,
      podeGerirLink: false,
    });
    expect(ids(itens)).toEqual([SELECAO_BAIXAR]);
    expect(itens.some((i) => i.tipo === "separador")).toBe(false);
  });

  it("sem arquivo a validar, não oferece validar", () => {
    expect(ids(itensDaSelecaoDeDocumentos({ ...tudo, totalValidaveis: 0 }))).not.toContain(SELECAO_VALIDAR);
  });

  it("alterar status diz quantos entram quando nem todos podem", () => {
    expect(itensDaSelecaoDeDocumentos(tudo).find((i) => i.id === SELECAO_ALTERAR_STATUS)).toMatchObject({ rotulo: "Alterar status" });
    expect(
      itensDaSelecaoDeDocumentos({ ...tudo, totalStatusAlteravel: 2 }).find((i) => i.id === SELECAO_ALTERAR_STATUS),
    ).toMatchObject({ rotulo: "Alterar status (2)" });
  });

  it("no menu, o rótulo diz quantos documentos", () => {
    const itens = itensDaSelecaoDeDocumentos({ ...tudo, comContagem: true });
    expect(itens.find((i) => i.id === SELECAO_BAIXAR)).toMatchObject({ rotulo: "Baixar 3 documentos (.zip)" });
    expect(itens.find((i) => i.id === SELECAO_EXCLUIR)).toMatchObject({ rotulo: "Excluir 3 documentos" });
  });
});
