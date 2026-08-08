import { describe, expect, it } from "vitest";
import { localizarOcorrencias, normalizarBusca, paginaTemTextoPesquisavel, type PaginaTexto } from "./pdf-busca";

function item(texto: string, temQuebraLinha = false) {
  return { texto, temQuebraLinha };
}

describe("normalizarBusca", () => {
  it("baixa caixa e remove acento preservando comprimento", () => {
    expect(normalizarBusca("Fundação")).toBe("fundacao");
    expect(normalizarBusca("Fundação").length).toBe("Fundação".length);
  });

  it("cobre todo o alfabeto acentuado do português", () => {
    expect(normalizarBusca("áàâãéêíóôõúüç")).toBe("aaaaeeiooouuc");
  });
});

describe("localizarOcorrencias", () => {
  it("acha match simples dentro de 1 item", () => {
    const paginas: PaginaTexto[] = [{ pagina: 1, itens: [item("cota ausente na planta")] }];
    const r = localizarOcorrencias(paginas, "ausente");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ pagina: 1, partes: [{ itemIndex: 0, inicio: 5, fim: 12 }] });
  });

  it("é insensível a acento e caixa", () => {
    const paginas: PaginaTexto[] = [{ pagina: 1, itens: [item("Revisar a Fundação do pilar")] }];
    expect(localizarOcorrencias(paginas, "fundacao")).toHaveLength(1);
    expect(localizarOcorrencias(paginas, "FUNDAÇÃO")).toHaveLength(1);
  });

  it("acha múltiplas ocorrências na mesma página, em ordem", () => {
    const paginas: PaginaTexto[] = [{ pagina: 1, itens: [item("viga V1, viga V2, viga V3")] }];
    const r = localizarOcorrencias(paginas, "viga");
    expect(r).toHaveLength(3);
  });

  it("mapeia match que cruza 2 itens adjacentes sem separador (comum em CAD)", () => {
    // "fun" + "dação" concatenados direto (temQuebraLinha=false) = "fundação".
    const paginas: PaginaTexto[] = [{ pagina: 1, itens: [item("fun"), item("dação")] }];
    const r = localizarOcorrencias(paginas, "fundação");
    expect(r).toHaveLength(1);
    expect(r[0].partes).toEqual([
      { itemIndex: 0, inicio: 0, fim: 3 },
      { itemIndex: 1, inicio: 0, fim: 5 },
    ]);
  });

  it("NÃO cruza quebra de linha (limitação aceita — hífen de justificado não é recomposto)", () => {
    const paginas: PaginaTexto[] = [{ pagina: 1, itens: [item("fun", true), item("dação")] }];
    expect(localizarOcorrencias(paginas, "fundação")).toHaveLength(0);
    // Mas cada pedaço isolado continua buscável.
    expect(localizarOcorrencias(paginas, "dação")).toHaveLength(1);
  });

  it("varre várias páginas e preserva o número da página", () => {
    const paginas: PaginaTexto[] = [
      { pagina: 1, itens: [item("nada aqui")] },
      { pagina: 2, itens: [item("cota ausente")] },
      { pagina: 3, itens: [item("outra cota ausente também")] },
    ];
    const r = localizarOcorrencias(paginas, "cota");
    expect(r.map((o) => o.pagina)).toEqual([2, 3]);
  });

  it("termo vazio ou só espaço não retorna nada", () => {
    const paginas: PaginaTexto[] = [{ pagina: 1, itens: [item("qualquer coisa")] }];
    expect(localizarOcorrencias(paginas, "")).toHaveLength(0);
    expect(localizarOcorrencias(paginas, "   ")).toHaveLength(0);
  });

  it("página sem itens não quebra a busca", () => {
    const paginas: PaginaTexto[] = [{ pagina: 1, itens: [] }, { pagina: 2, itens: [item("texto")] }];
    expect(localizarOcorrencias(paginas, "texto")).toHaveLength(1);
  });

  it("conta matches sobrepostos", () => {
    const paginas: PaginaTexto[] = [{ pagina: 1, itens: [item("aaaa")] }];
    // "aa" em "aaaa": posições 0 e 1 e 2 (sobrepostas) = 3 ocorrências.
    expect(localizarOcorrencias(paginas, "aa")).toHaveLength(3);
  });
});

describe("paginaTemTextoPesquisavel", () => {
  it("true quando alguma página tem texto não-vazio", () => {
    const paginas: PaginaTexto[] = [{ pagina: 1, itens: [] }, { pagina: 2, itens: [item("ok")] }];
    expect(paginaTemTextoPesquisavel(paginas)).toBe(true);
  });

  it("false quando todas as páginas estão vazias (PDF escaneado, sem OCR)", () => {
    const paginas: PaginaTexto[] = [{ pagina: 1, itens: [] }, { pagina: 2, itens: [item("   ")] }];
    expect(paginaTemTextoPesquisavel(paginas)).toBe(false);
  });
});
