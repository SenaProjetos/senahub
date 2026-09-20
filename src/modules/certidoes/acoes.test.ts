import { describe, expect, it } from "vitest";

import {
  ACAO_BAIXAR,
  ACAO_EDITAR,
  ACAO_EXCLUIR,
  ACAO_LOTE_EXCLUIR,
  ACAO_LOTE_RENOVAR,
  ACAO_LOTE_ZIP,
  ACAO_NOVA_VERSAO,
  ACAO_VISUALIZAR,
  MOTIVO_SEM_DOCUMENTO,
  MOTIVO_UMA_POR_VEZ,
  itensDeCertidao,
  itensDeLoteCertidoes,
  urlDoZip,
} from "./acoes";

const achar = (itens: { id: string }[], id: string) => itens.find((i) => i.id === id);
const gere = { podeGerir: true };
const leitura = { podeGerir: false };
const comPdf = { arquivoNome: "cnd.pdf" };
const comImagem = { arquivoNome: "cnd.png" };
const semArquivo = { arquivoNome: null };

describe("itensDeCertidao", () => {
  it("PDF pode ser visualizado; imagem só baixada; sem arquivo, nenhum dos dois", () => {
    const pdf = itensDeCertidao(comPdf, gere);
    expect(achar(pdf, ACAO_VISUALIZAR)).toBeDefined();
    expect(achar(pdf, ACAO_BAIXAR)).toBeDefined();
    const img = itensDeCertidao(comImagem, gere);
    expect(achar(img, ACAO_VISUALIZAR)).toBeUndefined();
    expect(achar(img, ACAO_BAIXAR)).toBeDefined();
    const vazio = itensDeCertidao(semArquivo, gere);
    expect(achar(vazio, ACAO_VISUALIZAR)).toBeUndefined();
    expect(achar(vazio, ACAO_BAIXAR)).toBeUndefined();
  });

  it("o rótulo da nova versão depende de já haver documento", () => {
    expect(achar(itensDeCertidao(comPdf, gere), ACAO_NOVA_VERSAO)).toMatchObject({ rotulo: "Nova versão" });
    expect(achar(itensDeCertidao(semArquivo, gere), ACAO_NOVA_VERSAO)).toMatchObject({
      rotulo: "Adicionar documento",
    });
  });

  // Regra 5 da ADR-0002: o que o PERFIL não permite some.
  it("quem só lê não recebe nova versão, editar nem excluir", () => {
    const itens = itensDeCertidao(comPdf, leitura);
    for (const id of [ACAO_NOVA_VERSAO, ACAO_EDITAR, ACAO_EXCLUIR]) expect(achar(itens, id)).toBeUndefined();
  });

  it("excluir é destrutivo, mas a confirmação é a da própria tela (não duplica)", () => {
    const e = achar(itensDeCertidao(comPdf, gere), ACAO_EXCLUIR);
    expect(e).toMatchObject({ variant: "destructive" });
    expect(e).not.toHaveProperty("confirmar");
  });
});

describe("itensDeLoteCertidoes", () => {
  it("detalhes e editar ficam desabilitados, com o motivo, e não escondidos", () => {
    const itens = itensDeLoteCertidoes([comPdf, comPdf], gere);
    expect(itens.find((i) => i.id === "detalhes")).toMatchObject({ desabilitado: MOTIVO_UMA_POR_VEZ });
    expect(achar(itens, ACAO_EDITAR)).toMatchObject({ desabilitado: MOTIVO_UMA_POR_VEZ });
  });

  it("o zip desabilita quando nenhuma selecionada tem documento", () => {
    expect(achar(itensDeLoteCertidoes([semArquivo, semArquivo], gere), ACAO_LOTE_ZIP)).toMatchObject({
      desabilitado: MOTIVO_SEM_DOCUMENTO,
    });
    const zip = achar(itensDeLoteCertidoes([semArquivo, comPdf], gere), ACAO_LOTE_ZIP) as { desabilitado?: string };
    expect(zip.desabilitado).toBeUndefined();
  });

  it("renovar e excluir em lote só existem para quem gere; excluir pede confirmação", () => {
    const leitor = itensDeLoteCertidoes([comPdf], leitura);
    expect(achar(leitor, ACAO_LOTE_RENOVAR)).toBeUndefined();
    expect(achar(leitor, ACAO_LOTE_EXCLUIR)).toBeUndefined();
    const gestor = itensDeLoteCertidoes([comPdf], gere);
    expect(achar(gestor, ACAO_LOTE_RENOVAR)).toBeDefined();
    expect((achar(gestor, ACAO_LOTE_EXCLUIR) as { confirmar?: { titulo: string } }).confirmar?.titulo).toBeTruthy();
  });
});

describe("urlDoZip", () => {
  it("junta os ids na query da rota", () => {
    expect(urlDoZip(["a", "b"])).toBe("/api/certidoes/zip?ids=a,b");
  });
});
