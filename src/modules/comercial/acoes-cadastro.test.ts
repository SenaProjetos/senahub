import { describe, expect, it } from "vitest";

import {
  ACAO_ALTERNAR_ATIVO,
  ACAO_COPIAR_NOME,
  ACAO_EDITAR,
  ACAO_LOTE_ARQUIVAR,
  ACAO_LOTE_REATIVAR,
  MOTIVO_TODOS_ARQUIVADOS,
  MOTIVO_TODOS_ATIVOS,
  itensDeCadastroArquivavel,
  itensDeLoteArquivaveis,
} from "./acoes-cadastro";

const ids = (itens: { id: string }[]) => itens.map((i) => i.id);
const achar = (itens: { id: string }[], id: string) => itens.find((i) => i.id === id);

describe("itensDeCadastroArquivavel", () => {
  it("editar, arquivar e copiar o nome", () => {
    expect(ids(itensDeCadastroArquivavel({ ativo: true }))).toEqual([
      ACAO_EDITAR,
      ACAO_ALTERNAR_ATIVO,
      "sep-copiar",
      ACAO_COPIAR_NOME,
    ]);
  });

  it("o rótulo do alternar segue o estado", () => {
    expect(achar(itensDeCadastroArquivavel({ ativo: true }), ACAO_ALTERNAR_ATIVO)).toMatchObject({ rotulo: "Arquivar" });
    expect(achar(itensDeCadastroArquivavel({ ativo: false }), ACAO_ALTERNAR_ATIVO)).toMatchObject({ rotulo: "Reativar" });
  });
});

describe("itensDeLoteArquivaveis", () => {
  const ativo = { ativo: true };
  const arquivado = { ativo: false };

  it("mistura de estados: os dois habilitados", () => {
    const itens = itensDeLoteArquivaveis([ativo, arquivado]);
    expect(achar(itens, ACAO_LOTE_ARQUIVAR)).not.toHaveProperty("desabilitado", MOTIVO_TODOS_ARQUIVADOS);
    expect(achar(itens, ACAO_LOTE_REATIVAR)).not.toHaveProperty("desabilitado", MOTIVO_TODOS_ATIVOS);
  });

  // Regra 5 da ADR-0002: o que o ESTADO impede fica desabilitado, com o motivo.
  it("todos arquivados: arquivar fica desabilitado com o motivo", () => {
    expect(achar(itensDeLoteArquivaveis([arquivado, arquivado]), ACAO_LOTE_ARQUIVAR)).toMatchObject({
      desabilitado: MOTIVO_TODOS_ARQUIVADOS,
    });
  });

  it("todos ativos: reativar fica desabilitado com o motivo", () => {
    expect(achar(itensDeLoteArquivaveis([ativo, ativo]), ACAO_LOTE_REATIVAR)).toMatchObject({
      desabilitado: MOTIVO_TODOS_ATIVOS,
    });
  });
});
