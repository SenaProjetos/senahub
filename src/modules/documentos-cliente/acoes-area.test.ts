import { describe, expect, it } from "vitest";
import {
  ACAO_DOC_BAIXAR,
  ACAO_DOC_EDITAR,
  ACAO_DOC_EXCLUIR,
  ACAO_DOC_EXIBIR_RECEBIDOS,
  ACAO_DOC_NOVA_VERSAO,
  ACAO_VERSAO_BAIXAR,
  ACAO_VERSAO_EXCLUIR,
  itensDeDocumentoArea,
  itensDeVersaoDocumento,
  type DocumentoParaAcoes,
} from "./acoes-area";

const doc: DocumentoParaAcoes = { nome: "Contrato.pdf", origem: "interno", exibirEmRecebidos: false, downloadUrl: "/api/documentos/v1/download", totalVersoes: 1 };
const admin = { podeGerir: true, podeExcluir: true };
const ids = (d: DocumentoParaAcoes, area: "recebidos" | "base" | "geral", ctx = admin) =>
  itensDeDocumentoArea(d, { area, ...ctx }).flatMap((i) => (i.tipo === "separador" ? [] : [i.id]));

describe("itensDeDocumentoArea", () => {
  it("Geral: tudo — baixar, nova versão, editar, exibir em Recebidos e excluir", () => {
    expect(ids(doc, "geral")).toEqual([ACAO_DOC_BAIXAR, ACAO_DOC_NOVA_VERSAO, ACAO_DOC_EDITAR, ACAO_DOC_EXIBIR_RECEBIDOS, ACAO_DOC_EXCLUIR]);
  });

  it("Base e Recebidos não editam metadados nem compartilham (isso é do Geral)", () => {
    expect(ids({ ...doc, origem: "base_arquitetonica" }, "base")).toEqual([ACAO_DOC_BAIXAR, ACAO_DOC_NOVA_VERSAO, ACAO_DOC_EXCLUIR]);
    expect(ids({ ...doc, origem: "recebido_cliente" }, "recebidos")).toEqual([ACAO_DOC_BAIXAR, ACAO_DOC_NOVA_VERSAO, ACAO_DOC_EXCLUIR]);
  });

  it("documento do Geral em Recebidos só baixa: quem o gere é a pasta Geral", () => {
    expect(ids({ ...doc, origem: "interno" }, "recebidos")).toEqual([ACAO_DOC_BAIXAR]);
  });

  it("o rótulo de exibir em Recebidos acompanha o estado", () => {
    const de = (exibir: boolean) =>
      itensDeDocumentoArea({ ...doc, exibirEmRecebidos: exibir }, { area: "geral", ...admin }).find((i) => i.id === ACAO_DOC_EXIBIR_RECEBIDOS);
    expect(de(false)).toMatchObject({ rotulo: "Exibir também em Recebidos do cliente" });
    expect(de(true)).toMatchObject({ rotulo: "Parar de exibir em Recebidos do cliente" });
  });

  it("sem permissão de gerir/excluir, o item não entra (nada de desabilitado por perfil)", () => {
    expect(ids(doc, "geral", { podeGerir: false, podeExcluir: false })).toEqual([ACAO_DOC_BAIXAR]);
    expect(ids(doc, "geral", { podeGerir: true, podeExcluir: false })).not.toContain(ACAO_DOC_EXCLUIR);
    expect(ids(doc, "geral", { podeGerir: false, podeExcluir: true })).toEqual([ACAO_DOC_BAIXAR, ACAO_DOC_EXCLUIR]);
  });

  it("documento sem arquivo não tem 'Baixar'", () => {
    expect(ids({ ...doc, downloadUrl: null }, "base")).not.toContain(ACAO_DOC_BAIXAR);
  });

  it("excluir é destrutivo, pede confirmação e diz quantas versões vão junto", () => {
    const um = itensDeDocumentoArea(doc, { area: "geral", ...admin }).find((i) => i.id === ACAO_DOC_EXCLUIR)!;
    expect(um).toMatchObject({ variant: "destructive" });
    expect(um.tipo === "acao" && um.confirmar?.titulo).toBe('Excluir "Contrato.pdf"?');
    const varias = itensDeDocumentoArea({ ...doc, totalVersoes: 3 }, { area: "geral", ...admin }).find((i) => i.id === ACAO_DOC_EXCLUIR)!;
    expect(varias.tipo === "acao" && varias.confirmar?.descricao).toMatch(/3 versões/);
  });

  it("nunca sobra separador solto", () => {
    for (const ctx of [admin, { podeGerir: false, podeExcluir: true }, { podeGerir: true, podeExcluir: false }]) {
      const it = itensDeDocumentoArea(doc, { area: "geral", ...ctx });
      if (it.length === 0) continue;
      expect(it[0].tipo).not.toBe("separador");
      expect(it[it.length - 1].tipo).not.toBe("separador");
    }
  });
});

describe("itensDeVersaoDocumento", () => {
  const v = { numero: 2, downloadUrl: "/api/documentos/v2/download" };
  it("baixar sempre; excluir só para quem pode, com confirmação", () => {
    expect(itensDeVersaoDocumento(v, { podeExcluir: false }).map((i) => i.id)).toEqual([ACAO_VERSAO_BAIXAR]);
    const com = itensDeVersaoDocumento(v, { podeExcluir: true });
    expect(com.filter((i) => i.tipo !== "separador").map((i) => i.id)).toEqual([ACAO_VERSAO_BAIXAR, ACAO_VERSAO_EXCLUIR]);
    const ex = com.find((i) => i.id === ACAO_VERSAO_EXCLUIR)!;
    expect(ex.tipo === "acao" && ex.confirmar?.titulo).toBe("Excluir a versão 2?");
  });
});
