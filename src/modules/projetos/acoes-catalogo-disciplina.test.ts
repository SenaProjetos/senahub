import { describe, expect, it } from "vitest";

import {
  ACAO_ARQUIVAR,
  ACAO_DESARQUIVAR,
  ACAO_DESCER,
  ACAO_EDITAR,
  ACAO_EXCLUIR,
  ACAO_LOTE_ARQUIVAR,
  ACAO_LOTE_DESARQUIVAR,
  ACAO_LOTE_EXCLUIR,
  ACAO_SUBIR,
  MOTIVO_LIMPAR_BUSCA,
  MOTIVO_PRIMEIRA,
  MOTIVO_TODAS_ARQUIVADAS,
  MOTIVO_TODAS_ATIVAS,
  MOTIVO_TODAS_EM_USO,
  MOTIVO_UMA_POR_VEZ,
  excluiveis,
  itensDeDisciplinaCatalogo,
  itensDeLoteDisciplinas,
} from "./acoes-catalogo-disciplina";

const achar = (itens: { id: string }[], id: string) => itens.find((i) => i.id === id);
const livre = { ativo: true, uso: 0 };
const emUso = { ativo: true, uso: 3 };
const arquivada = { ativo: false, uso: 0 };
const meio = { podeReordenar: true, temCima: true, temBaixo: true };

describe("itensDeDisciplinaCatalogo", () => {
  it("ativa oferece arquivar; arquivada oferece desarquivar", () => {
    expect(achar(itensDeDisciplinaCatalogo(livre, meio), ACAO_ARQUIVAR)).toBeDefined();
    expect(achar(itensDeDisciplinaCatalogo(livre, meio), ACAO_DESARQUIVAR)).toBeUndefined();
    expect(achar(itensDeDisciplinaCatalogo(arquivada, meio), ACAO_DESARQUIVAR)).toBeDefined();
    expect(achar(itensDeDisciplinaCatalogo(arquivada, meio), ACAO_ARQUIVAR)).toBeUndefined();
  });

  it("reordenar desabilita, com o motivo, na primeira, na última e durante a busca", () => {
    const primeira = itensDeDisciplinaCatalogo(livre, { ...meio, temCima: false });
    expect(achar(primeira, ACAO_SUBIR)).toMatchObject({ desabilitado: MOTIVO_PRIMEIRA });
    expect((achar(primeira, ACAO_DESCER) as { desabilitado?: string }).desabilitado).toBeUndefined();
    const buscando = itensDeDisciplinaCatalogo(livre, { ...meio, podeReordenar: false });
    expect(achar(buscando, ACAO_SUBIR)).toMatchObject({ desabilitado: MOTIVO_LIMPAR_BUSCA });
    expect(achar(buscando, ACAO_DESCER)).toMatchObject({ desabilitado: MOTIVO_LIMPAR_BUSCA });
  });

  it("excluir é destrutivo, mas a confirmação é a da própria tela (não duplica)", () => {
    const e = achar(itensDeDisciplinaCatalogo(livre, meio), ACAO_EXCLUIR);
    expect(e).toMatchObject({ variant: "destructive" });
    expect(e).not.toHaveProperty("confirmar");
  });
});

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
