import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Correção local do pdf.js (`scripts/corrigir-pdfjs.mjs`, aplicada no postinstall): o "ponto" de uma linha traço-ponto
 * exportada do CAD é um subcaminho de comprimento zero (`x y m x y l S`) com capa redonda — a especificação do PDF manda
 * pintar um círculo. O canvas do Chrome descarta segmento de comprimento zero, então o pdf.js só mostrava os traços.
 *
 * O teste roda a função REAL do arquivo instalado (`makePathFromDrawOPS` de `pdfjs-dist/build/pdf.mjs`): se um upgrade
 * do pdf.js trouxer o arquivo sem a correção, ele falha aqui, antes de a prancha voltar a perder os pontos.
 */

const ARQUIVO = resolve("node_modules/pdfjs-dist/build/pdf.mjs");
const DRAW_OPS = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 };

type Chamada = [string, ...number[]];

class Path2DGravador {
  chamadas: Chamada[] = [];
  moveTo(x: number, y: number) {
    this.chamadas.push(["moveTo", x, y]);
  }
  lineTo(x: number, y: number) {
    this.chamadas.push(["lineTo", x, y]);
  }
  bezierCurveTo(...a: number[]) {
    this.chamadas.push(["bezierCurveTo", ...a]);
  }
  quadraticCurveTo(...a: number[]) {
    this.chamadas.push(["quadraticCurveTo", ...a]);
  }
  closePath() {
    this.chamadas.push(["closePath"]);
  }
}

type MontarCaminho = (data: Float32Array, capaRedonda?: boolean) => Path2DGravador;

function carregarMontador(): MontarCaminho {
  const fonte = readFileSync(ARQUIVO, "utf8");
  const inicio = fonte.indexOf("function makePathFromDrawOPS(");
  expect(inicio, "makePathFromDrawOPS sumiu do pdf.js instalado").toBeGreaterThanOrEqual(0);
  const fim = fonte.indexOf("\n}\n", inicio);
  const funcao = fonte.slice(inicio, fim + 2);
  return new Function("Path2D", "DrawOPS", "warn", `${funcao}\nreturn makePathFromDrawOPS;`)(
    Path2DGravador,
    DRAW_OPS,
    () => {},
  ) as MontarCaminho;
}

const ponto = (x: number, y: number) => new Float32Array([0, x, y, 1, x, y]);

describe("pdf.js instalado: ponto de comprimento zero com capa redonda", () => {
  it("o arquivo instalado tem a correção (rode `node scripts/corrigir-pdfjs.mjs`)", () => {
    expect(readFileSync(ARQUIVO, "utf8")).toContain("SENAHUB:ponto-degenerado");
  });

  it("o constructPath passa a capa redonda ao montar o caminho", () => {
    expect(readFileSync(ARQUIVO, "utf8")).toContain('makePathFromDrawOPS(path, this.ctx.lineCap === "round")');
  });

  it("vira um segmento mínimo que o canvas não descarta (vale também com coordenada grande em float32)", () => {
    const montar = carregarMontador();
    for (const [x, y] of [
      [32538, 30064],
      [0, 0],
      [0.5, 7],
      [987654, 123],
    ]) {
      const [, fim] = montar(ponto(x, y), true).chamadas;
      expect(fim[0]).toBe("lineTo");
      expect(fim[2]).toBe(Math.fround(y));
      // O canvas guarda o caminho em float32: o x novo precisa continuar diferente depois do arredondamento...
      expect(Math.fround(fim[1])).not.toBe(Math.fround(x));
      // ...e o segmento precisa ser desprezível perto da espessura da linha.
      expect(Math.abs(fim[1] - Math.fround(x))).toBeLessThan(Math.max(Math.abs(x), 1) * 1e-5);
    }
  });

  it("sem capa redonda o caminho fica como veio (a especificação do PDF não pinta o ponto com capa reta)", () => {
    expect(carregarMontador()(ponto(10, 20), false).chamadas).toEqual([
      ["moveTo", 10, 20],
      ["lineTo", 10, 20],
    ]);
  });

  it("não mexe em segmento de verdade nem em repetição no meio de uma linha", () => {
    const data = new Float32Array([0, 1, 1, 1, 5, 1, 1, 5, 1, 1, 9, 9, 4]);
    expect(carregarMontador()(data, true).chamadas).toEqual([
      ["moveTo", 1, 1],
      ["lineTo", 5, 1],
      ["lineTo", 5, 1],
      ["lineTo", 9, 9],
      ["closePath"],
    ]);
  });
});
