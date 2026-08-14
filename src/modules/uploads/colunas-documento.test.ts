import { describe, expect, it } from "vitest";
import {
  COLUNAS_DOCUMENTO,
  idsOcultaveis,
  resolverColunasVisiveis,
  sugerirOcultasPara,
} from "./colunas-documento";

describe("resolverColunasVisiveis", () => {
  it("sem preferência mostra tudo", () => {
    const v = resolverColunasVisiveis(undefined);
    expect(v.size).toBe(COLUNAS_DOCUMENTO.length);
  });

  it("esconde o que a preferência pede", () => {
    const v = resolverColunasVisiveis(["tamanho", "data"]);
    expect(v.has("tamanho")).toBe(false);
    expect(v.has("data")).toBe(false);
    expect(v.has("documento")).toBe(true);
  });

  it("ignora tentativa de esconder coluna essencial", () => {
    const v = resolverColunasVisiveis(["documento", "disciplina"]);
    expect(v.has("documento")).toBe(true);
    expect(v.has("disciplina")).toBe(true);
  });

  it("ignora id desconhecido sem quebrar (coluna removida numa versão futura)", () => {
    const v = resolverColunasVisiveis(["coluna-que-nao-existe", "tamanho"]);
    expect(v.has("tamanho")).toBe(false);
    expect(v.size).toBe(COLUNAS_DOCUMENTO.length - 1);
  });

  it("tolera lixo vindo do JSON do banco", () => {
    for (const entrada of [null, 42, "tamanho", { tamanho: true }, [1, 2, 3]]) {
      expect(resolverColunasVisiveis(entrada).size).toBe(COLUNAS_DOCUMENTO.length);
    }
  });
});

describe("idsOcultaveis", () => {
  it("nunca inclui essencial", () => {
    const ocultaveis = idsOcultaveis();
    expect(ocultaveis).not.toContain("documento");
    expect(ocultaveis).not.toContain("disciplina");
    expect(ocultaveis.length).toBe(COLUNAS_DOCUMENTO.length - 2);
  });
});

describe("sugerirOcultasPara", () => {
  it("em 1440px ou mais não sugere esconder nada (a tabela cabe)", () => {
    expect(sugerirOcultasPara(1440)).toEqual([]);
    expect(sugerirOcultasPara(1920)).toEqual([]);
  });

  it("em 1366px sugere cortar as últimas, que foi o que estorvou na verificação", () => {
    const s = sugerirOcultasPara(1366);
    expect(s).toContain("tamanho");
    expect(s).toContain("data");
    expect(s).not.toContain("revisao");
  });

  it("quanto mais estreito, mais colunas cedem", () => {
    expect(sugerirOcultasPara(900).length).toBeGreaterThan(sugerirOcultasPara(1366).length);
  });

  it("nunca sugere esconder essencial, por mais estreita que seja a tela", () => {
    for (const l of [320, 640, 900, 1024, 1280]) {
      expect(sugerirOcultasPara(l)).not.toContain("documento");
      expect(sugerirOcultasPara(l)).not.toContain("disciplina");
    }
  });
});
