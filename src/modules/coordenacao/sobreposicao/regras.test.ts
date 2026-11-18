import { describe, expect, it } from "vitest";
import type { Primitiva } from "@/modules/dwg/parse";
import { IDENTIDADE, encaixeInicial, type Alinhamento, type Caixa } from "./transformacao";
import {
  COR_BASE,
  LAYER_ARQUITETURA,
  PALETA_CAMADAS,
  alinhamentoEfetivo,
  arquivoVigente,
  corSugerida,
  ehLayerArquitetura,
  estadoDoAlinhamento,
  formatoDoArquivo,
  motivoParaNaoRemover,
  nativoDwg,
  pinoParaMundo,
  pontoParaPino,
  primitivasDaCamada,
} from "./regras";

const up = (id: string, nomeArquivo: string, versao: number, excluidoEm: Date | null = null) => ({
  id,
  nomeArquivo,
  versao,
  excluidoEm,
});

describe("formatoDoArquivo", () => {
  it("reconhece pdf e dwg sem diferenciar caixa", () => {
    expect(formatoDoArquivo("planta.pdf")).toBe("pdf");
    expect(formatoDoArquivo("PLANTA.PDF")).toBe("pdf");
    expect(formatoDoArquivo("a.b.Dwg")).toBe("dwg");
  });
  it("outra extensão ou sem extensão é null", () => {
    expect(formatoDoArquivo("modelo.ifc")).toBeNull();
    expect(formatoDoArquivo("planta")).toBeNull();
    expect(formatoDoArquivo("pdf")).toBeNull();
  });
});

describe("arquivoVigente", () => {
  it("pega a maior versão do formato", () => {
    const l = [up("a", "x.pdf", 1), up("b", "x.pdf", 3), up("c", "x.pdf", 2)];
    expect(arquivoVigente(l, "pdf")?.id).toBe("b");
  });
  it("ignora lixeira e outro formato", () => {
    const l = [up("a", "x.pdf", 1), up("b", "x.pdf", 5, new Date()), up("c", "x.dwg", 9)];
    expect(arquivoVigente(l, "pdf")?.id).toBe("a");
    expect(arquivoVigente(l, "dwg")?.id).toBe("c");
  });
  it("tudo na lixeira ou lista vazia dá null", () => {
    expect(arquivoVigente([up("a", "x.pdf", 1, new Date())], "pdf")).toBeNull();
    expect(arquivoVigente([], "pdf")).toBeNull();
    expect(arquivoVigente([up("a", "x.pdf", 1)], "dwg")).toBeNull();
  });
});

describe("estadoDoAlinhamento", () => {
  it("sem alinhamento", () => {
    expect(estadoDoAlinhamento(null, "u1")).toBe("sem_alinhamento");
  });
  it("alinhada quando conferido é o vigente", () => {
    expect(estadoDoAlinhamento({ uploadConferidoId: "u1" }, "u1")).toBe("alinhada");
  });
  it("revisão anterior quando o vigente mudou", () => {
    expect(estadoDoAlinhamento({ uploadConferidoId: "u0" }, "u1")).toBe("revisao_anterior");
    expect(estadoDoAlinhamento({ uploadConferidoId: null }, "u1")).toBe("revisao_anterior");
  });
});

describe("ehLayerArquitetura", () => {
  it("compara sem diferenciar caixa e exige nome exato", () => {
    expect(LAYER_ARQUITETURA).toBe("SENA_ARQ");
    expect(ehLayerArquitetura("sena_arq")).toBe(true);
    expect(ehLayerArquitetura("SENA_ARQ")).toBe(true);
    expect(ehLayerArquitetura("SENA_ARQ_COTAS")).toBe(false);
    expect(ehLayerArquitetura("0")).toBe(false);
  });
});

describe("primitivasDaCamada", () => {
  const prims: Primitiva[] = [
    { tipo: "linha", p1: { x: 0, y: 0 }, p2: { x: 1, y: 1 }, camada: "ESTR" },
    { tipo: "linha", p1: { x: 0, y: 0 }, p2: { x: 2, y: 2 }, camada: "sena_arq" },
    { tipo: "circulo", centro: { x: 0, y: 0 }, raio: 1, camada: "SENA_ARQ" },
  ];
  it("na base mantém tudo", () => {
    const r = primitivasDaCamada(prims, true);
    expect(r.primitivas).toHaveLength(3);
    expect(r.achouArquitetura).toBe(false);
  });
  it("fora da base tira só SENA_ARQ", () => {
    const r = primitivasDaCamada(prims, false);
    expect(r.primitivas).toHaveLength(1);
    expect(r.primitivas[0].camada).toBe("ESTR");
    expect(r.achouArquitetura).toBe(true);
  });
  it("fora da base sem SENA_ARQ não acha arquitetura", () => {
    const r = primitivasDaCamada([prims[0]], false);
    expect(r.primitivas).toHaveLength(1);
    expect(r.achouArquitetura).toBe(false);
  });
  it("fora da base devolve à parte as do SENA_ARQ (desenhadas em cinza ao alinhar)", () => {
    const r = primitivasDaCamada(prims, false);
    expect(r.arquitetura.map((p) => p.camada)).toEqual(["sena_arq", "SENA_ARQ"]);
  });
  it("na base a arquitetura já está nas primitivas: a lista à parte vem vazia", () => {
    expect(primitivasDaCamada(prims, true).arquitetura).toEqual([]);
  });
});

describe("nativoDwg", () => {
  it("inverte o Y", () => {
    expect(nativoDwg({ x: 3, y: 4 })).toEqual({ x: 3, y: -4 });
  });
});

describe("pontoParaPino / pinoParaMundo", () => {
  const pagina = { largura: 600, altura: 400 };
  it("identidade: centro da folha é 0,5;0,5", () => {
    expect(pontoParaPino({ x: 300, y: 200 }, IDENTIDADE, pagina)).toEqual({ x: 0.5, y: 0.5 });
  });
  it("fora da folha é null; bordas valem", () => {
    expect(pontoParaPino({ x: 700, y: 10 }, IDENTIDADE, pagina)).toBeNull();
    expect(pontoParaPino({ x: 10, y: -1 }, IDENTIDADE, pagina)).toBeNull();
    expect(pontoParaPino({ x: 0, y: 0 }, IDENTIDADE, pagina)).toEqual({ x: 0, y: 0 });
    expect(pontoParaPino({ x: 600, y: 400 }, IDENTIDADE, pagina)).toEqual({ x: 1, y: 1 });
  });
  it("ida e volta num alinhamento girado", () => {
    const al: Alinhamento = { tx: 120, ty: -35, giro: 37, escala: 1.7 };
    const mundo = pinoParaMundo({ x: 0.3, y: 0.8 }, al, pagina);
    const pino = pontoParaPino(mundo, al, pagina);
    expect(pino).not.toBeNull();
    expect(pino!.x).toBeCloseTo(0.3, 9);
    expect(pino!.y).toBeCloseTo(0.8, 9);
  });
  it("pinoParaMundo na identidade escala pela página", () => {
    expect(pinoParaMundo({ x: 0.5, y: 0.25 }, IDENTIDADE, pagina)).toEqual({ x: 300, y: 100 });
  });
});

describe("paleta e cor sugerida", () => {
  it("8 cores hex distintas, sem a cor da base", () => {
    expect(PALETA_CAMADAS).toHaveLength(8);
    expect(new Set(PALETA_CAMADAS.map((c) => c.toLowerCase())).size).toBe(8);
    for (const c of PALETA_CAMADAS) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    expect(PALETA_CAMADAS.map((c) => c.toLowerCase())).not.toContain(COR_BASE.toLowerCase());
    expect(COR_BASE).toBe("#374151");
  });
  it("não repete enquanto há cor livre", () => {
    const usadas: string[] = [];
    for (let i = 0; i < 8; i++) {
      const c = corSugerida(usadas);
      expect(usadas).not.toContain(c);
      usadas.push(c);
    }
    expect(new Set(usadas).size).toBe(8);
  });
  it("compara sem diferenciar caixa", () => {
    expect(corSugerida([PALETA_CAMADAS[0].toUpperCase()])).toBe(PALETA_CAMADAS[1]);
  });
  it("todas usadas devolve a menos repetida (empate: ordem da paleta)", () => {
    const todas = [...PALETA_CAMADAS];
    expect(corSugerida(todas)).toBe(PALETA_CAMADAS[0]);
    const mais = [...todas, ...todas.filter((_, i) => i !== 3)];
    expect(corSugerida(mais)).toBe(PALETA_CAMADAS[3]);
  });
});

describe("motivoParaNaoRemover", () => {
  it("base com outras camadas bloqueia", () => {
    expect(motivoParaNaoRemover({ base: true }, 3)).toBe(
      "Defina outra camada como base antes de remover esta.",
    );
  });
  it("base sozinha ou camada comum pode", () => {
    expect(motivoParaNaoRemover({ base: true }, 1)).toBeNull();
    expect(motivoParaNaoRemover({ base: false }, 3)).toBeNull();
  });
});

describe("alinhamentoEfetivo", () => {
  const mundo: Caixa = { minX: 0, minY: 0, maxX: 1000, maxY: 700 };
  const nativa: Caixa = { minX: -50, minY: -20, maxX: 50, maxY: 50 };
  const salvo: Alinhamento = { tx: 12, ty: -4, giro: 30, escala: 2.5 };
  const camada = (formato: "pdf" | "dwg", base: boolean, alinhamentos: Partial<Record<"pdf" | "dwg", { alinhamento: Alinhamento }>>) => ({
    formato,
    base,
    alinhamentos,
  });

  it("usa o alinhamento salvo do formato em uso", () => {
    expect(alinhamentoEfetivo(camada("dwg", false, { dwg: { alinhamento: salvo } }), mundo, nativa)).toEqual(salvo);
  });

  it("o alinhamento do OUTRO formato não vale: cai no encaixe inicial", () => {
    expect(alinhamentoEfetivo(camada("dwg", false, { pdf: { alinhamento: salvo } }), mundo, nativa)).toEqual(
      encaixeInicial(nativa, mundo),
    );
  });

  it("camada sem alinhamento encaixa a caixa dela na do mundo", () => {
    expect(alinhamentoEfetivo(camada("pdf", false, {}), mundo, nativa)).toEqual(encaixeInicial(nativa, mundo));
  });

  it("base sem alinhamento define o mundo: identidade", () => {
    expect(alinhamentoEfetivo(camada("pdf", true, {}), mundo, nativa)).toEqual(IDENTIDADE);
  });

  it("base com alinhamento salvo usa o salvo", () => {
    expect(alinhamentoEfetivo(camada("pdf", true, { pdf: { alinhamento: salvo } }), mundo, nativa)).toEqual(salvo);
  });
});
