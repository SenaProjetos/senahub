import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  abasSeta,
  caixaRecorte,
  ARRASTO_MINIMO,
  caixaMarcacao,
  caminhoNuvem,
  construirMarcacao,
  construirMedidas,
  construirRabisco,
  CORES_RABISCO,
  HEX_COR_RABISCO,
  lerMarcacao,
  MARCACAO_LABEL,
  MAX_PONTOS_RABISCO,
  simplificarTraco,
  TIPOS_MARCACAO,
  type Marcacao,
} from "@/modules/projetos/pendencias/marcacao";

describe("catálogo", () => {
  it("todo tipo tem rótulo pt-BR", () => {
    for (const t of TIPOS_MARCACAO) expect(MARCACAO_LABEL[t]).toBeTruthy();
  });
});

describe("construirMarcacao", () => {
  it("ponto ignora o fim do arrasto — a âncora já é tudo", () => {
    const r = construirMarcacao("ponto", { x: 0.2, y: 0.3 }, { x: 0.9, y: 0.9 });
    expect(r).toEqual({ x: 0.2, y: 0.3, marcacao: { tipo: "ponto", pontos: [] } });
  });

  it("retângulo guarda OFFSET, não coordenada absoluta", () => {
    const r = construirMarcacao("retangulo", { x: 0.2, y: 0.3 }, { x: 0.5, y: 0.7 });
    expect(r?.x).toBeCloseTo(0.2);
    expect(r?.y).toBeCloseTo(0.3);
    expect(r?.marcacao.pontos[0].dx).toBeCloseTo(0.3);
    expect(r?.marcacao.pontos[0].dy).toBeCloseTo(0.4);
  });

  it("offset negativo quando arrasta pra trás (direita→esquerda, baixo→cima)", () => {
    const r = construirMarcacao("retangulo", { x: 0.8, y: 0.8 }, { x: 0.3, y: 0.2 });
    expect(r?.marcacao.pontos[0].dx).toBeCloseTo(-0.5);
    expect(r?.marcacao.pontos[0].dy).toBeCloseTo(-0.6);
  });

  it("arrasto curto demais vira null (o chamador trata como clique)", () => {
    const curto = ARRASTO_MINIMO / 2;
    expect(construirMarcacao("retangulo", { x: 0.5, y: 0.5 }, { x: 0.5 + curto, y: 0.5 + curto })).toBeNull();
  });

  it("arrasto só na horizontal (ou só na vertical) ainda vale — seta reta é legítima", () => {
    expect(construirMarcacao("seta", { x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 })).not.toBeNull();
    expect(construirMarcacao("seta", { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.9 })).not.toBeNull();
  });

  it("limita a âncora e o fim a 0..1 (arrasto que sai da página)", () => {
    const r = construirMarcacao("retangulo", { x: -0.3, y: 1.4 }, { x: 2, y: -1 });
    expect(r?.x).toBe(0);
    expect(r?.y).toBe(1);
    expect(r?.marcacao.pontos[0].dx).toBeCloseTo(1);
    expect(r?.marcacao.pontos[0].dy).toBeCloseTo(-1);
  });
});

describe("lerMarcacao", () => {
  it("linha legada (colunas nulas) não tem marcação", () => {
    expect(lerMarcacao(null, null)).toBeNull();
    expect(lerMarcacao(undefined, undefined)).toBeNull();
  });
  it('"ponto" não vira forma — é o comportamento de sempre', () => {
    expect(lerMarcacao("ponto", { pontos: [] })).toBeNull();
  });
  it("tipo desconhecido cai no pino em vez de desenhar lixo", () => {
    expect(lerMarcacao("elipse", { pontos: [{ dx: 0.1, dy: 0.1 }] })).toBeNull();
  });
  it("geometria corrompida (sem pontos, ponto não-numérico, NaN) cai no pino", () => {
    expect(lerMarcacao("retangulo", {})).toBeNull();
    expect(lerMarcacao("retangulo", { pontos: [{ dx: "a", dy: 1 }] })).toBeNull();
    expect(lerMarcacao("retangulo", { pontos: [{ dx: NaN, dy: 1 }] })).toBeNull();
  });
  it("quantidade de pontos diferente de 1 cai no pino", () => {
    expect(lerMarcacao("retangulo", { pontos: [] })).toBeNull();
    expect(lerMarcacao("retangulo", { pontos: [{ dx: 0.1, dy: 0.1 }, { dx: 0.2, dy: 0.2 }] })).toBeNull();
  });
  it("lê o que `construirMarcacao` escreveu (ida e volta)", () => {
    const feito = construirMarcacao("nuvem", { x: 0.2, y: 0.2 }, { x: 0.6, y: 0.5 })!;
    expect(lerMarcacao(feito.marcacao.tipo, feito.marcacao)).toEqual(feito.marcacao);
  });
});

describe("caixaMarcacao", () => {
  it("normaliza arrasto pra trás — mesma caixa dos dois sentidos", () => {
    const frente = caixaMarcacao(0.2, 0.3, { tipo: "retangulo", pontos: [{ dx: 0.3, dy: 0.4 }] });
    const tras = caixaMarcacao(0.5, 0.7, { tipo: "retangulo", pontos: [{ dx: -0.3, dy: -0.4 }] });
    for (const k of ["esquerda", "topo", "largura", "altura"] as const) {
      expect(tras[k]).toBeCloseTo(frente[k]);
    }
    expect(frente.esquerda).toBeCloseTo(0.2);
    expect(frente.topo).toBeCloseTo(0.3);
    expect(frente.largura).toBeCloseTo(0.3);
    expect(frente.altura).toBeCloseTo(0.4);
  });
  it("sem marcação é caixa de área zero na própria âncora", () => {
    expect(caixaMarcacao(0.4, 0.6, null)).toEqual({ esquerda: 0.4, topo: 0.6, largura: 0, altura: 0 });
  });

  it("a caixa ANDA JUNTO quando a âncora é relocalizada (item 3)", () => {
    // É o motivo de a geometria ser offset: relocalizar move só x/y, e a forma segue.
    const m: Marcacao = { tipo: "retangulo", pontos: [{ dx: 0.2, dy: 0.1 }] };
    const antes = caixaMarcacao(0.3, 0.3, m);
    const depois = caixaMarcacao(0.5, 0.45, m); // âncora reposicionada na revisão nova
    expect(depois.esquerda - antes.esquerda).toBeCloseTo(0.2);
    expect(depois.topo - antes.topo).toBeCloseTo(0.15);
    expect(depois.largura).toBeCloseTo(antes.largura);
    expect(depois.altura).toBeCloseTo(antes.altura);
  });
});

describe("caminhoNuvem", () => {
  it("fecha o contorno e começa na origem local", () => {
    const d = caminhoNuvem(100, 60, 8);
    expect(d.startsWith("M 0 0")).toBe(true);
    expect(d.trim().endsWith("Z")).toBe(true);
  });

  it("todo arco é semicírculo estufado pra fora (sweep=1, large-arc=0)", () => {
    const d = caminhoNuvem(100, 60, 8);
    const arcos = d.match(/A [\d.]+ [\d.]+ 0 0 1 /g) ?? [];
    expect(arcos.length).toBeGreaterThan(0);
    // Nenhum arco com outra combinação de flags — bulge invertido apareceria como sweep=0.
    expect(d.match(/A [\d.]+ [\d.]+ 0 [01] [01] /g)?.length).toBe(arcos.length);
  });

  it("cada lado fecha num número inteiro de arcos, então os cantos caem em fim de arco", () => {
    const l = 100;
    const a = 60;
    const raio = 10;
    const d = caminhoNuvem(l, a, raio);
    const esperado = Math.max(1, Math.round(l / 20)) * 2 + Math.max(1, Math.round(a / 20)) * 2;
    expect((d.match(/A /g) ?? []).length).toBe(esperado);
  });

  it("mais arcos quando o raio é menor (onda mais miúda)", () => {
    const grosso = (caminhoNuvem(200, 100, 25).match(/A /g) ?? []).length;
    const fino = (caminhoNuvem(200, 100, 5).match(/A /g) ?? []).length;
    expect(fino).toBeGreaterThan(grosso);
  });

  it("lado curto demais ainda recebe UMA onda, nunca um trecho reto", () => {
    const d = caminhoNuvem(200, 3, 25);
    // 2 lados curtos (esquerda/direita) × 1 arco cada + os 2 longos.
    expect((d.match(/A /g) ?? []).length).toBeGreaterThanOrEqual(2 + 2);
  });

  it("área degenerada não gera caminho", () => {
    expect(caminhoNuvem(0, 50, 8)).toBe("");
    expect(caminhoNuvem(50, 0, 8)).toBe("");
  });

  it("usa o valor absoluto — arrasto pra trás desenha a mesma nuvem", () => {
    expect(caminhoNuvem(-100, -60, 8)).toBe(caminhoNuvem(100, 60, 8));
  });
});

describe("abasSeta", () => {
  it("as duas abas ficam atrás da ponta, simétricas em relação ao eixo", () => {
    const [a, b] = abasSeta({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
    expect(a.x).toBeCloseTo(b.x); // mesma distância atrás da ponta
    expect(a.x).toBeLessThan(100);
    expect(a.y).toBeCloseTo(-b.y); // espelhadas
    expect(a.y).not.toBeCloseTo(0);
  });

  it("acompanha a direção da seta (diagonal)", () => {
    const [a, b] = abasSeta({ x: 0, y: 0 }, { x: 50, y: 50 }, 10);
    // Ambas atrás da ponta ao longo da diagonal.
    for (const p of [a, b]) expect(Math.hypot(p.x - 50, p.y - 50)).toBeCloseTo(10);
  });

  it("abertura maior afasta mais as abas do eixo", () => {
    const estreita = abasSeta({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, 10);
    const larga = abasSeta({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, 40);
    expect(Math.abs(larga[0].y)).toBeGreaterThan(Math.abs(estreita[0].y));
  });
});

describe("caixaRecorte (item 14)", () => {
  const CW = 2000;
  const CH = 1000;
  const M: Marcacao = { tipo: "retangulo", pontos: [{ dx: 0.2, dy: 0.1 }] };

  it("cobre a marcação com folga em volta", () => {
    const r = caixaRecorte(0.3, 0.4, M, CW, CH);
    // marcação: x 0.3..0.5, y 0.4..0.5 → folga de 25% de cada lado
    expect(r.sx).toBe(Math.round(0.25 * CW));
    expect(r.sy).toBe(Math.round(0.375 * CH));
    expect(r.sw).toBe(Math.round(0.3 * CW));
    expect(r.sh).toBe(Math.round(0.15 * CH));
  });

  it("usa os pixels REAIS do canvas, não o tamanho CSS", () => {
    // Dobrar a resolução do canvas dobra o recorte — é o que mantém a miniatura alinhada
    // com o desenho em tela retina.
    const a = caixaRecorte(0.3, 0.4, M, CW, CH);
    const b = caixaRecorte(0.3, 0.4, M, CW * 2, CH * 2);
    expect(b.sx).toBe(a.sx * 2);
    expect(b.sw).toBe(a.sw * 2);
  });

  it("não estoura as bordas do canvas", () => {
    const casos: [number, number, Marcacao][] = [
      [0.0, 0.0, { tipo: "retangulo", pontos: [{ dx: 0.1, dy: 0.1 }] }],
      [0.95, 0.95, { tipo: "retangulo", pontos: [{ dx: 0.05, dy: 0.05 }] }],
      [0.5, 0.5, { tipo: "retangulo", pontos: [{ dx: -0.5, dy: -0.5 }] }],
      [1, 1, { tipo: "nuvem", pontos: [{ dx: -1, dy: -1 }] }],
    ];
    for (const [x, y, m] of casos) {
      const r = caixaRecorte(x, y, m, CW, CH);
      expect(r.sx).toBeGreaterThanOrEqual(0);
      expect(r.sy).toBeGreaterThanOrEqual(0);
      expect(r.sx + r.sw).toBeLessThanOrEqual(CW);
      expect(r.sy + r.sh).toBeLessThanOrEqual(CH);
    }
  });

  it("marcação de área zero vira janelinha, nunca recorte 0x0", () => {
    const r = caixaRecorte(0.5, 0.5, null, CW, CH);
    expect(r.sw).toBeGreaterThan(1);
    expect(r.sh).toBeGreaterThan(1);
  });

  it("arrasto pra trás dá o mesmo recorte do arrasto pra frente", () => {
    const frente = caixaRecorte(0.3, 0.4, { tipo: "retangulo", pontos: [{ dx: 0.2, dy: 0.1 }] }, CW, CH);
    const tras = caixaRecorte(0.5, 0.5, { tipo: "retangulo", pontos: [{ dx: -0.2, dy: -0.1 }] }, CW, CH);
    expect(tras).toEqual(frente);
  });
});

describe("rabisco (desenho livre)", () => {
  const reta = (x0: number, y0: number, x1: number, y1: number, n = 50) =>
    Array.from({ length: n }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / (n - 1), y: y0 + ((y1 - y0) * i) / (n - 1) }));

  it("simplificar tira os pontos do meio de uma reta e guarda as quinas", () => {
    expect(simplificarTraco(reta(0.1, 0.1, 0.5, 0.1))).toEqual([{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }]);
    const l = [...reta(0.1, 0.1, 0.5, 0.1), ...reta(0.5, 0.1, 0.5, 0.4).slice(1)];
    expect(simplificarTraco(l)).toEqual([{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.4 }]);
  });

  it("âncora no 1º ponto do 1º traço; traços viram offsets, cada um separado", () => {
    const r = construirRabisco([reta(0.2, 0.2, 0.4, 0.2), reta(0.3, 0.3, 0.3, 0.5)])!;
    expect(r.x).toBe(0.2);
    expect(r.y).toBe(0.2);
    expect(r.marcacao.tipo).toBe("livre");
    expect(r.marcacao.pontos).toEqual([]);
    expect(r.marcacao.tracos).toEqual([
      [{ dx: 0, dy: 0 }, { dx: 0.2, dy: 0 }],
      [{ dx: 0.1, dy: 0.1 }, { dx: 0.1, dy: 0.3 }],
    ]);
  });

  it("toque sem arrastar (1 ponto) e rabisco do tamanho de um ponto não viram forma", () => {
    expect(construirRabisco([[{ x: 0.5, y: 0.5 }]])).toBeNull();
    expect(construirRabisco([reta(0.5, 0.5, 0.5 + ARRASTO_MINIMO / 2, 0.5)])).toBeNull();
    expect(construirRabisco([])).toBeNull();
  });

  it("ponto fora da página é preso à borda", () => {
    const r = construirRabisco([[{ x: -0.1, y: 0.5 }, { x: 0.3, y: 1.2 }]])!;
    expect(r.x).toBe(0);
    expect(r.marcacao.tracos![0][1]).toEqual({ dx: 0.3, dy: 0.5 });
  });

  it("respeita o teto de pontos", () => {
    // Zigue-zague: nenhum ponto some na simplificação.
    const zigue = Array.from({ length: MAX_PONTOS_RABISCO + 500 }, (_, i) => ({ x: (i % 2) * 0.2 + 0.1, y: 0.1 + i * 1e-4 }));
    const r = construirRabisco([zigue])!;
    expect(r.marcacao.tracos!.flat().length).toBeLessThanOrEqual(MAX_PONTOS_RABISCO);
  });

  it("gravado e lido de volta é o mesmo desenho", () => {
    const r = construirRabisco([reta(0.2, 0.2, 0.4, 0.3), reta(0.25, 0.4, 0.35, 0.45)])!;
    const geo = JSON.parse(JSON.stringify({ pontos: [], tracos: r.marcacao.tracos }));
    expect(lerMarcacao("livre", geo)).toEqual(r.marcacao);
  });

  it("leitura: sem traço válido não há forma; traço de 1 ponto sai; lixo cai no pino", () => {
    expect(lerMarcacao("livre", { pontos: [] })).toBeNull();
    expect(lerMarcacao("livre", { tracos: [[{ dx: 0, dy: 0 }]] })).toBeNull();
    expect(lerMarcacao("livre", { tracos: [[{ dx: 0, dy: 0 }], [{ dx: 0, dy: 0 }, { dx: 0.1, dy: 0 }]] })!.tracos).toHaveLength(1);
    expect(lerMarcacao("livre", { tracos: [[{ dx: "a", dy: 0 }]] })).toBeNull();
  });

  it("caixa cobre todos os traços, não só o primeiro", () => {
    const m: Marcacao = { tipo: "livre", pontos: [], tracos: [[{ dx: 0, dy: 0 }, { dx: 0.1, dy: 0 }], [{ dx: -0.05, dy: 0.2 }, { dx: 0, dy: 0.3 }]] };
    const c = caixaMarcacao(0.5, 0.5, m);
    expect(c.esquerda).toBeCloseTo(0.45);
    expect(c.topo).toBeCloseTo(0.5);
    expect(c.largura).toBeCloseTo(0.15);
    expect(c.altura).toBeCloseTo(0.3);
  });

  it("arrasto de dois pontos não fabrica rabisco", () => {
    expect(construirMarcacao("livre", { x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 })).toBeNull();
  });
});

describe("cor e espessura do rabisco", () => {
  const reta = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y1 }];

  it("cada traço leva o seu estilo; traço descartado leva o estilo junto", () => {
    const r = construirRabisco(
      [reta(0.1, 0.1, 0.3, 0.1), [{ x: 0.5, y: 0.5 }], reta(0.2, 0.2, 0.2, 0.4)],
      [{ cor: "vermelho", espessura: 4 }, { cor: "azul", espessura: 7 }, { cor: "verde", espessura: 2 }],
    )!;
    expect(r.marcacao.tracos).toHaveLength(2);
    expect(r.marcacao.estilos).toEqual([{ cor: "vermelho", espessura: 4 }, { cor: "verde", espessura: 2 }]);
  });

  it("sem estilo, ou estilo fora do catálogo, vira o padrão (cor da situação, fina)", () => {
    const r = construirRabisco([reta(0.1, 0.1, 0.3, 0.1)], [{ cor: "roxo" as never, espessura: 99 }])!;
    expect(r.marcacao.estilos).toEqual([{ cor: "situacao", espessura: 2 }]);
    // Rabisco gravado antes das cores (sem `estilos`) continua abrindo.
    expect(lerMarcacao("livre", { tracos: [[{ dx: 0, dy: 0 }, { dx: 0.1, dy: 0 }]] })!.estilos).toEqual([{ cor: "situacao", espessura: 2 }]);
  });

  it("ler de volta mantém cores e espessuras alinhadas aos traços", () => {
    const r = construirRabisco([reta(0.1, 0.1, 0.3, 0.1), reta(0.2, 0.2, 0.2, 0.4)], [{ cor: "preto", espessura: 7 }, { cor: "laranja", espessura: 4 }])!;
    const geo = JSON.parse(JSON.stringify({ pontos: [], tracos: r.marcacao.tracos, estilos: r.marcacao.estilos }));
    expect(lerMarcacao("livre", geo)).toEqual(r.marcacao);
  });

  it("as cores do PDF carimbado são as mesmas do globals.css", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    for (const cor of CORES_RABISCO) {
      if (cor === "situacao") continue;
      const m = css.match(new RegExp(`--marcacao-${cor}:\\s*(#[0-9a-fA-F]{6})`));
      expect(m?.[1]?.toLowerCase(), cor).toBe(HEX_COR_RABISCO[cor]);
    }
  });
});

describe("várias medidas num apontamento", () => {
  it("âncora no início da 1ª; cada medida com o seu valor; pontos = ponta da 1ª", () => {
    const r = construirMedidas([
      { a: { x: 0.2, y: 0.2 }, b: { x: 0.5, y: 0.2 }, mm: 3000 },
      { a: { x: 0.2, y: 0.3 }, b: { x: 0.2, y: 0.6 }, mm: 2100 },
    ])!;
    expect(r.x).toBe(0.2);
    expect(r.y).toBe(0.2);
    expect(r.marcacao.pontos).toEqual([{ dx: 0.3, dy: 0 }]);
    expect(r.marcacao.medidas).toEqual([
      { de: { dx: 0, dy: 0 }, ate: { dx: 0.3, dy: 0 }, mm: 3000 },
      { de: { dx: 0, dy: 0.1 }, ate: { dx: 0, dy: 0.4 }, mm: 2100 },
    ]);
  });

  it("clique (segmento curto) e medida sem valor saem; nada sobrando = null", () => {
    const r = construirMedidas([
      { a: { x: 0.2, y: 0.2 }, b: { x: 0.2 + ARRASTO_MINIMO / 3, y: 0.2 }, mm: 5 },
      { a: { x: 0.3, y: 0.3 }, b: { x: 0.6, y: 0.3 }, mm: 0 },
      { a: { x: 0.1, y: 0.5 }, b: { x: 0.4, y: 0.5 }, mm: 1500 },
    ])!;
    expect(r.marcacao.medidas).toHaveLength(1);
    expect(r.x).toBe(0.1);
    expect(construirMedidas([])).toBeNull();
  });

  it("gravado e lido de volta; medida antiga (só pontos) continua lendo", () => {
    const r = construirMedidas([
      { a: { x: 0.2, y: 0.2 }, b: { x: 0.5, y: 0.2 }, mm: 3000 },
      { a: { x: 0.2, y: 0.3 }, b: { x: 0.2, y: 0.6 }, mm: 2100 },
    ])!;
    const geo = JSON.parse(JSON.stringify({ pontos: r.marcacao.pontos, medidas: r.marcacao.medidas }));
    expect(lerMarcacao("medida", geo)).toEqual(r.marcacao);
    expect(lerMarcacao("medida", { pontos: [{ dx: 0.1, dy: 0 }] })).toEqual({ tipo: "medida", pontos: [{ dx: 0.1, dy: 0 }] });
    // Lixo em `medidas` não derruba: cai na medida única de `pontos`.
    expect(lerMarcacao("medida", { pontos: [{ dx: 0.1, dy: 0 }], medidas: [{ de: 1 }] })!.medidas).toBeUndefined();
  });

  it("caixa cobre todas as medidas", () => {
    const r = construirMedidas([
      { a: { x: 0.2, y: 0.2 }, b: { x: 0.5, y: 0.2 }, mm: 3000 },
      { a: { x: 0.1, y: 0.3 }, b: { x: 0.1, y: 0.6 }, mm: 2100 },
    ])!;
    const c = caixaMarcacao(r.x, r.y, r.marcacao);
    expect(c.esquerda).toBeCloseTo(0.1);
    expect(c.topo).toBeCloseTo(0.2);
    expect(c.largura).toBeCloseTo(0.4);
    expect(c.altura).toBeCloseTo(0.4);
  });
});
