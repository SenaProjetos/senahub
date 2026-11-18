import { describe, expect, it } from "vitest";
import { corrigirGiroDoApontamento, CORTE_GIRO_IGNORADO } from "./correcao-giro";
import { girarPonto } from "./giro";

const base = { x: 0.2, y: 0.3, marcacaoGeo: null, ancoraDx: null, ancoraDy: null };

describe("correção do apontamento gravado sem o /Rotate da página", () => {
  it("leva o pino para o espaço com /Rotate (o que o visualizador e o carimbo usam)", () => {
    const r = corrigirGiroDoApontamento(base, 270);
    expect(r.x).toBeCloseTo(0.3, 12);
    expect(r.y).toBeCloseTo(0.8, 12);
  });

  it("página sem /Rotate não muda nada", () => {
    const ap = { ...base, marcacaoGeo: { pontos: [{ dx: 0.1, dy: 0.2 }] }, ancoraDx: 0.01, ancoraDy: 0.02 };
    expect(corrigirGiroDoApontamento(ap, 0)).toEqual(ap);
  });

  it("a âncora textual continua apontando para o mesmo item de texto (que já estava no espaço com /Rotate)", () => {
    const ap = { ...base, ancoraDx: 0.01, ancoraDy: -0.02 };
    const itemX = ap.x - ap.ancoraDx;
    const itemY = ap.y - ap.ancoraDy;
    const r = corrigirGiroDoApontamento(ap, 90);
    expect(r.x - (r.ancoraDx as number)).toBeCloseTo(itemX, 12);
    expect(r.y - (r.ancoraDy as number)).toBeCloseTo(itemY, 12);
  });

  it("sem âncora textual, a âncora continua vazia", () => {
    const r = corrigirGiroDoApontamento(base, 180);
    expect(r.ancoraDx).toBeNull();
    expect(r.ancoraDy).toBeNull();
  });

  it.each([90, 180, 270] as const)("a forma acompanha o pino em %i°: cada vértice cai onde o ponto girado cai", (rot) => {
    const ap = {
      ...base,
      marcacaoGeo: {
        pontos: [{ dx: 0.1, dy: 0.05 }],
        tracos: [
          [
            { dx: 0, dy: 0 },
            { dx: -0.04, dy: 0.07 },
          ],
        ],
        estilos: [{ cor: "vermelho", espessura: 2 }],
        medidas: [{ de: { dx: 0, dy: 0 }, ate: { dx: 0.2, dy: -0.1 }, mm: 1234.5 }],
      },
    };
    const r = corrigirGiroDoApontamento(ap, rot);
    const geo = r.marcacaoGeo as typeof ap.marcacaoGeo;
    const confere = (antes: { dx: number; dy: number }, depois: { dx: number; dy: number }) => {
      const esperado = girarPonto(ap.x + antes.dx, ap.y + antes.dy, rot);
      expect(r.x + depois.dx).toBeCloseTo(esperado.u, 12);
      expect(r.y + depois.dy).toBeCloseTo(esperado.v, 12);
    };
    confere(ap.marcacaoGeo.pontos[0], geo.pontos[0]);
    confere(ap.marcacaoGeo.tracos[0][1], geo.tracos[0][1]);
    confere(ap.marcacaoGeo.medidas[0].ate, geo.medidas[0].ate);
    // O que não é posição fica como estava: estilo do traço e o valor congelado da medida.
    expect(geo.estilos).toEqual(ap.marcacaoGeo.estilos);
    expect(geo.medidas[0].mm).toBe(1234.5);
  });

  it("geometria fora do formato passa intacta (a leitura já a ignora)", () => {
    const ap = { ...base, marcacaoGeo: { pontos: "quebrado", outro: 1 } };
    expect(corrigirGiroDoApontamento(ap, 90).marcacaoGeo).toEqual({ pontos: "quebrado", outro: 1 });
  });

  it("o corte é o merge que levou o giro ignorado para o master (14/08/2026, 13:10 de Brasília)", () => {
    expect(CORTE_GIRO_IGNORADO.toISOString()).toBe("2026-08-14T16:10:33.000Z");
  });
});
