import { describe, expect, it } from "vitest";
import { elementoCresceComTexto, organizarFluxo } from "./fluxo";
import type { Elemento } from "./schema";

const estilo: Elemento["estilo"] = {
  fontSize: 11,
  bold: false,
  italic: false,
  align: "left",
  color: "",
  bg: "",
  borderW: 0,
  borderColor: "#1C2D58",
  borderStyle: "solida",
  radius: 0,
  fontFamily: "",
};

const el = (id: string, y: number, h: number, x = 0, tipo: Elemento["tipo"] = "paragrafo"): Elemento => ({
  id,
  tipo,
  x,
  y,
  w: 400,
  h,
  texto: id,
  estilo,
  visivel: true,
  travado: false,
});

describe("organizarFluxo", () => {
  it("empilha de cima para baixo, preservando o espaço do desenho", () => {
    const r = organizarFluxo([el("b", 120, 40), el("a", 20, 60)]);
    expect(r.map((x) => x.elemento.id)).toEqual(["a", "b"]);
    // "a" ocupa 20→80; "b" começa em 120 → 40px de respiro.
    expect(r.map((x) => x.espacoAcima)).toEqual([0, 40]);
  });

  it("elementos sobrepostos não geram espaço negativo", () => {
    const r = organizarFluxo([el("a", 0, 100), el("b", 60, 40)]);
    expect(r.map((x) => x.espacoAcima)).toEqual([0, 0]);
  });

  it("lado a lado (mesmo y) desempata pela esquerda e não afasta o de baixo", () => {
    const r = organizarFluxo([el("dir", 10, 30, 300), el("esq", 10, 30, 0), el("baixo", 40, 20)]);
    expect(r.map((x) => x.elemento.id)).toEqual(["esq", "dir", "baixo"]);
    expect(r[2].espacoAcima).toBe(0);
  });

  it("o mais baixo manda no espaço seguinte, mesmo vindo antes na lista", () => {
    // "alto" termina em 200; "curto" termina em 60. O próximo respira a partir de 200.
    const r = organizarFluxo([el("alto", 0, 200), el("curto", 20, 40, 300), el("depois", 240, 20)]);
    expect(r.map((x) => x.elemento.id)).toEqual(["alto", "curto", "depois"]);
    expect(r[2].espacoAcima).toBe(40);
  });

  it("não muta a lista recebida e aceita faixa vazia", () => {
    const original = [el("b", 50, 10), el("a", 10, 10)];
    organizarFluxo(original);
    expect(original.map((e) => e.id)).toEqual(["b", "a"]);
    expect(organizarFluxo([])).toEqual([]);
  });
});

describe("elementoCresceComTexto", () => {
  it("cresce no que é texto; mantém altura no que é forma, imagem ou tabela", () => {
    for (const t of ["label", "campo", "paragrafo"] as const) expect(elementoCresceComTexto(t)).toBe(true);
    for (const t of ["linha", "retangulo", "imagem", "tabela", "qrcode", "assinatura"] as const) {
      expect(elementoCresceComTexto(t)).toBe(false);
    }
  });
});
