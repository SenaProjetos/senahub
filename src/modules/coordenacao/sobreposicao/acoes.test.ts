import { describe, expect, it } from "vitest";
import type { AcaoItem } from "@/components/ui/acoes";
import { itensDaCamada, itensDaSobreposicao } from "@/modules/coordenacao/sobreposicao/acoes";

const ids = (itens: AcaoItem[]) => itens.filter((i) => i.tipo !== "separador").map((i) => i.id);
const item = (itens: AcaoItem[], id: string) => itens.find((i) => i.id === id);

const camada = {
  podeGerir: true,
  base: false,
  formato: "pdf" as const,
  temPdf: true,
  temDwg: true,
  totalCamadas: 3,
};

describe("itensDaSobreposicao", () => {
  it("sem podeGerir não há item nenhum", () => {
    expect(itensDaSobreposicao({ podeGerir: false })).toEqual([]);
  });

  it("com podeGerir: renomear e excluir, o excluir com confirmação", () => {
    const itens = itensDaSobreposicao({ podeGerir: true });
    expect(ids(itens)).toEqual(["renomear", "excluir"]);
    const excluir = item(itens, "excluir");
    expect(excluir?.tipo === "acao" && excluir.variant).toBe("destructive");
    expect(excluir?.tipo === "acao" && excluir.confirmar?.titulo).toBeTruthy();
  });
});

describe("itensDaCamada", () => {
  it("sem podeGerir não há item de escrita", () => {
    expect(itensDaCamada({ ...camada, podeGerir: false })).toEqual([]);
  });

  it("camada comum em PDF: definir base, usar DWG, alinhar e remover", () => {
    expect(ids(itensDaCamada(camada))).toEqual(["definir-base", "usar-dwg", "alinhar", "remover"]);
  });

  it("camada em DWG oferece usar PDF, não usar DWG", () => {
    expect(ids(itensDaCamada({ ...camada, formato: "dwg" }))).toEqual(["definir-base", "usar-pdf", "alinhar", "remover"]);
  });

  it("a base não oferece 'Definir como base'", () => {
    expect(ids(itensDaCamada({ ...camada, base: true }))).not.toContain("definir-base");
  });

  it("documento só com PDF: 'Usar o DWG' fica desabilitado com o motivo", () => {
    const usar = item(itensDaCamada({ ...camada, temDwg: false }), "usar-dwg");
    expect(usar?.tipo === "acao" && usar.desabilitado).toBe("Este documento não tem arquivo DWG vigente.");
  });

  it("documento só com DWG: 'Usar o PDF' fica desabilitado com o motivo", () => {
    const usar = item(itensDaCamada({ ...camada, formato: "dwg", temPdf: false }), "usar-pdf");
    expect(usar?.tipo === "acao" && usar.desabilitado).toBe("Este documento não tem arquivo PDF vigente.");
  });

  it("remover a base com outras camadas: desabilitado com o motivo da regra", () => {
    const remover = item(itensDaCamada({ ...camada, base: true, totalCamadas: 2 }), "remover");
    expect(remover?.tipo === "acao" && remover.desabilitado).toBe("Defina outra camada como base antes de remover esta.");
  });

  it("a base sozinha pode ser removida e continua podendo ser realinhada", () => {
    const itens = itensDaCamada({ ...camada, base: true, totalCamadas: 1 });
    expect(ids(itens)).toContain("alinhar");
    const remover = item(itens, "remover");
    expect(remover?.tipo === "acao" && remover.desabilitado).toBeUndefined();
  });

  it("camada sem desenho na tela: 'Alinhar' fica desabilitado com o motivo", () => {
    const alinhar = item(itensDaCamada({ ...camada, semDesenho: true }), "alinhar");
    expect(alinhar?.tipo === "acao" && alinhar.desabilitado).toBe("A camada ainda não está desenhada. Espere carregar para alinhar.");
  });

  it("camada desenhada: 'Alinhar' habilitado", () => {
    const alinhar = item(itensDaCamada(camada), "alinhar");
    expect(alinhar?.tipo === "acao" && alinhar.desabilitado).toBeUndefined();
  });

  it("remover é destrutivo e pede confirmação", () => {
    const remover = item(itensDaCamada(camada), "remover");
    expect(remover?.tipo === "acao" && remover.variant).toBe("destructive");
    expect(remover?.tipo === "acao" && remover.confirmar).toBeTruthy();
  });
});
