import { describe, expect, it } from "vitest";

import {
  ACAO_LOTE_APROVAR,
  ACAO_LOTE_COPIAR_NOMES,
  ACAO_LOTE_EXCLUIR,
  ACAO_LOTE_MANTER,
  ACAO_LOTE_ZIP,
  itensDeLoteAprovacoes,
  itensDeLoteDiretorio,
  itensDeLotePedidosExclusao,
  textoDosNomes,
  urlDoZip,
} from "./acoes-lote";

describe("itensDeLoteDiretorio", () => {
  it("o lote do diretório é só leitura: baixar e copiar", () => {
    expect(itensDeLoteDiretorio().map((i) => i.id)).toEqual([ACAO_LOTE_ZIP, ACAO_LOTE_COPIAR_NOMES]);
  });

  it("nenhum item é destrutivo — o diretório é tela de consulta", () => {
    for (const item of itensDeLoteDiretorio()) {
      expect(item).not.toHaveProperty("variant", "destructive");
    }
  });
});

describe("urlDoZip", () => {
  it("usa a rota que já confere o escopo de cada upload", () => {
    expect(urlDoZip(["a", "b"])).toBe("/api/uploads/zip?ids=a,b");
  });
});

describe("textoDosNomes", () => {
  it("um nome por linha, na ordem recebida", () => {
    expect(textoDosNomes(["x.pdf", "y.dwg"])).toBe("x.pdf\ny.dwg");
    expect(textoDosNomes([])).toBe("");
  });
});

describe("itensDeLoteAprovacoes", () => {
  it("aprovar vem primeiro, seguido do que o diretório já oferece", () => {
    expect(itensDeLoteAprovacoes().map((i) => i.id)).toEqual([
      ACAO_LOTE_APROVAR,
      ACAO_LOTE_ZIP,
      ACAO_LOTE_COPIAR_NOMES,
    ]);
  });

  // O risco desta tela é aprovar em massa o que deveria ser olhado item a item.
  it("aprovar pede confirmação", () => {
    const aprovar = itensDeLoteAprovacoes()[0];
    expect(aprovar.tipo === "acao" && aprovar.confirmar?.titulo).toBeTruthy();
  });
});

describe("itensDeLotePedidosExclusao", () => {
  it("manter e excluir, nessa ordem — o seguro antes do destrutivo", () => {
    expect(itensDeLotePedidosExclusao().map((i) => i.id)).toEqual([ACAO_LOTE_MANTER, ACAO_LOTE_EXCLUIR]);
  });

  it("excluir é destrutivo e pede confirmação (regra 4 da ADR-0002)", () => {
    const excluir = itensDeLotePedidosExclusao().find((i) => i.id === ACAO_LOTE_EXCLUIR);
    expect(excluir).toMatchObject({ variant: "destructive" });
    expect(excluir?.tipo === "acao" && excluir.confirmar?.titulo).toBeTruthy();
  });

  it("manter NÃO tem confirm: abre o diálogo de motivo, que já é a confirmação", () => {
    const manter = itensDeLotePedidosExclusao().find((i) => i.id === ACAO_LOTE_MANTER);
    expect(manter?.tipo === "acao" && manter.confirmar).toBeUndefined();
  });
});
