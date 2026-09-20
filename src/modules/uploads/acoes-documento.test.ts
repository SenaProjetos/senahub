import { describe, expect, it } from "vitest";

import type { AcaoItem } from "@/components/ui/acoes";
import {
  MOTIVO_OCUPADO,
  PREFIXO_COPIAR_LINK,
  arquivoDoCopiarLink,
  itensDeDocumento,
  type ContextoAcoesDocumento,
  type DocumentoParaAcoes,
} from "./acoes-documento";

const PDF = { id: "u-pdf", nome: "EST-0001-R02.pdf", ext: "pdf", downloadUrl: "/api/uploads/u-pdf/download" };
const DWG = { id: "u-dwg", nome: "EST-0001-R02.dwg", ext: "dwg", downloadUrl: "/api/uploads/u-dwg/download" };

const doc: DocumentoParaAcoes = {
  id: PDF.id,
  nome: PDF.nome,
  versao: 2,
  validado: false,
  podeGerir: true,
  arquivos: [PDF],
};

const ctx: ContextoAcoesDocumento = {
  projetoId: "p1",
  podeValidar: true,
  podeExcluir: true,
  podeSolicitarExclusao: true,
};

function achar(itens: readonly AcaoItem[], id: string): AcaoItem | undefined {
  for (const item of itens) {
    if (item.id === id) return item;
    if (item.tipo === "sub") {
      const dentro = achar(item.itens, id);
      if (dentro) return dentro;
    }
  }
  return undefined;
}

const ids = (itens: readonly AcaoItem[]) => itens.map((i) => i.id);

describe("itensDeDocumento", () => {
  it("monta o menu completo de um PDF pendente, para quem pode tudo", () => {
    expect(ids(itensDeDocumento(doc, ctx))).toEqual([
      "detalhes",
      "visualizar",
      "comparar",
      `baixar:${PDF.id}`,
      `${PREFIXO_COPIAR_LINK}${PDF.id}`,
      "copiar-nome",
      "historico",
      "sep-validacao",
      "validar",
      "solicitar-ajuste",
      "sep-gerir",
      "renomear",
      "sep-excluir",
      "excluir",
    ]);
  });

  it("aponta o visualizador para o PDF mesmo quando ele não é o primeiro arquivo", () => {
    const itens = itensDeDocumento({ ...doc, id: DWG.id, arquivos: [DWG, PDF] }, ctx);
    const visualizar = achar(itens, "visualizar");
    if (visualizar?.tipo !== "link") throw new Error("visualizar não veio");
    expect(visualizar.href).toBe(`/projetos/p1/arquivos/${PDF.id}/visualizar`);
    expect(visualizar.novaAba).toBe(true);
  });

  it("sem PDF não oferece visualizar nem comparar", () => {
    const itens = itensDeDocumento({ ...doc, id: DWG.id, arquivos: [DWG] }, ctx);
    expect(achar(itens, "visualizar")).toBeUndefined();
    expect(achar(itens, "comparar")).toBeUndefined();
  });

  it("só oferece comparar a partir da segunda revisão", () => {
    expect(achar(itensDeDocumento({ ...doc, versao: 1 }, ctx), "comparar")).toBeUndefined();
  });

  // A regra 1 da ADR-0002: a linha tinha link nativo para CADA arquivo, então o menu repõe cada um.
  it("repõe baixar e copiar link de cada arquivo quando a revisão tem mais de um", () => {
    const itens = itensDeDocumento({ ...doc, arquivos: [PDF, DWG] }, ctx);
    const baixar = achar(itens, "baixar");
    const copiar = achar(itens, "copiar-link");
    if (baixar?.tipo !== "sub" || copiar?.tipo !== "sub") throw new Error("submenus não vieram");
    expect(baixar.itens.map((i) => (i.tipo === "link" ? i.href : null))).toEqual([
      PDF.downloadUrl,
      DWG.downloadUrl,
    ]);
    expect(ids(copiar.itens)).toEqual([`${PREFIXO_COPIAR_LINK}${PDF.id}`, `${PREFIXO_COPIAR_LINK}${DWG.id}`]);
  });

  it("com um arquivo só, baixar é um link direto, sem submenu", () => {
    const baixar = achar(itensDeDocumento(doc, ctx), `baixar:${PDF.id}`);
    expect(baixar).toMatchObject({ tipo: "link", rotulo: "Baixar", href: PDF.downloadUrl });
  });

  it("troca validar por desfazer quando o arquivo já está validado", () => {
    const itens = itensDeDocumento({ ...doc, validado: true }, ctx);
    expect(achar(itens, "desfazer-validacao")).toBeDefined();
    expect(achar(itens, "validar")).toBeUndefined();
    expect(achar(itens, "solicitar-ajuste")).toBeUndefined();
  });

  it("esconde a validação de quem não valida e de arquivo em pasta", () => {
    expect(achar(itensDeDocumento(doc, { ...ctx, podeValidar: false }), "validar")).toBeUndefined();
    expect(achar(itensDeDocumento({ ...doc, validado: null }, ctx), "validar")).toBeUndefined();
  });

  it("esconde renomear de quem não gere a disciplina", () => {
    expect(achar(itensDeDocumento({ ...doc, podeGerir: false }, ctx), "renomear")).toBeUndefined();
  });

  it("quem não exclui mas pode pedir vê 'Solicitar exclusão' no lugar", () => {
    const itens = itensDeDocumento(doc, { ...ctx, podeExcluir: false });
    expect(achar(itens, "excluir")).toBeUndefined();
    expect(achar(itens, "solicitar-exclusao")).toBeDefined();
  });

  it("quem só lê não recebe separador solto no fim", () => {
    const itens = itensDeDocumento(
      { ...doc, podeGerir: false },
      { ...ctx, podeValidar: false, podeExcluir: false, podeSolicitarExclusao: false },
    );
    expect(ids(itens)).toEqual([
      "detalhes",
      "visualizar",
      "comparar",
      `baixar:${PDF.id}`,
      `${PREFIXO_COPIAR_LINK}${PDF.id}`,
      "copiar-nome",
      "historico",
    ]);
  });

  it("trava validar e excluir enquanto outra ação corre, com o motivo à vista", () => {
    const itens = itensDeDocumento(doc, { ...ctx, ocupado: true });
    expect(achar(itens, "validar")).toMatchObject({ desabilitado: MOTIVO_OCUPADO });
    expect(achar(itens, "excluir")).toMatchObject({ desabilitado: MOTIVO_OCUPADO });
    // O que só abre diálogo continua livre.
    expect(achar(itens, "historico")).not.toHaveProperty("desabilitado");
  });
});

describe("arquivoDoCopiarLink", () => {
  it("extrai o upload do id e ignora os outros itens", () => {
    expect(arquivoDoCopiarLink(`${PREFIXO_COPIAR_LINK}u-dwg`)).toBe("u-dwg");
    expect(arquivoDoCopiarLink("historico")).toBeNull();
  });
});
