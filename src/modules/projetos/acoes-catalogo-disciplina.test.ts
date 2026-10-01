import { describe, expect, it } from "vitest";

import {
  ACAO_EDITAR,
  ACAO_LOTE_ARQUIVAR,
  ACAO_LOTE_DESARQUIVAR,
  ACAO_LOTE_EXCLUIR,
  MOTIVO_TODAS_ARQUIVADAS,
  MOTIVO_TODAS_ATIVAS,
  MOTIVO_TODAS_EM_USO,
  MOTIVO_UMA_POR_VEZ,
  excluiveis,
  itensDeLoteDisciplinas,
} from "./acoes-catalogo-disciplina";

const achar = (itens: { id: string }[], id: string) => itens.find((i) => i.id === id);
const livre = { ativo: true, uso: 0 };
const emUso = { ativo: true, uso: 3 };
const arquivada = { ativo: false, uso: 0 };

describe("itensDeLoteDisciplinas", () => {
  it("editar fica desabilitado, com o motivo, e não escondido", () => {
    expect(achar(itensDeLoteDisciplinas([livre, emUso]), ACAO_EDITAR)).toMatchObject({
      desabilitado: MOTIVO_UMA_POR_VEZ,
    });
  });

  it("arquivar e desarquivar desabilitam quando o estado impede", () => {
    expect(achar(itensDeLoteDisciplinas([arquivada, arquivada]), ACAO_LOTE_ARQUIVAR)).toMatchObject({
      desabilitado: MOTIVO_TODAS_ARQUIVADAS,
    });
    expect(achar(itensDeLoteDisciplinas([livre, emUso]), ACAO_LOTE_DESARQUIVAR)).toMatchObject({
      desabilitado: MOTIVO_TODAS_ATIVAS,
    });
  });

  it("excluir desabilita se todas estão em uso e pede confirmação", () => {
    expect(achar(itensDeLoteDisciplinas([emUso, emUso]), ACAO_LOTE_EXCLUIR)).toMatchObject({
      desabilitado: MOTIVO_TODAS_EM_USO,
    });
    const e = achar(itensDeLoteDisciplinas([livre, emUso]), ACAO_LOTE_EXCLUIR) as {
      desabilitado?: string;
      confirmar?: { titulo: string };
    };
    expect(e.desabilitado).toBeUndefined();
    expect(e.confirmar?.titulo).toBeTruthy();
  });
});

describe("excluiveis", () => {
  it("só as que nenhum projeto usa", () => {
    expect(excluiveis([livre, emUso, arquivada])).toEqual([livre, arquivada]);
  });
});
