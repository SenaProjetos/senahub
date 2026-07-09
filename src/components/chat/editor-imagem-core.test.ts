import { describe, expect, it } from "vitest";
import {
  type Shape,
  rotacionarShapes90,
  transladarShapes,
  espessuraPx,
  tamanhoTextoPx,
  normalizarCorte,
} from "./editor-imagem-core";

describe("editor-imagem-core", () => {
  describe("rotacionarShapes90 (horário: (x,y) → (H−y, x))", () => {
    it("gira um ponto de caneta corretamente", () => {
      // Imagem 100(W) × 50(H). Canto sup. esquerdo (0,0) → (50, 0) na nova (50×100).
      const shapes: Shape[] = [{ tipo: "caneta", pontos: [{ x: 0, y: 0 }, { x: 100, y: 50 }], cor: "#000", esp: 2 }];
      const [s] = rotacionarShapes90(shapes, 50);
      if (s.tipo !== "caneta") throw new Error("tipo mudou");
      expect(s.pontos[0]).toEqual({ x: 50, y: 0 });
      expect(s.pontos[1]).toEqual({ x: 0, y: 100 }); // canto inf. direito → canto inf. esquerdo
    });

    it("4 rotações em imagem quadrada = identidade", () => {
      const original: Shape[] = [
        { tipo: "seta", x1: 10, y1: 20, x2: 70, y2: 80, cor: "#f00", esp: 3 },
        { tipo: "texto", x: 33, y: 44, texto: "oi", cor: "#fff", tam: 20 },
      ];
      const L = 100; // quadrada: W = H, dimensões não trocam
      let atual = original;
      for (let i = 0; i < 4; i++) atual = rotacionarShapes90(atual, L);
      expect(atual).toEqual(original);
    });

    it("mantém cor/espessura/texto intactos", () => {
      const shapes: Shape[] = [{ tipo: "retangulo", x1: 1, y1: 2, x2: 3, y2: 4, cor: "#3b82f6", esp: 7 }];
      const [s] = rotacionarShapes90(shapes, 50);
      if (s.tipo !== "retangulo") throw new Error("tipo mudou");
      expect(s.cor).toBe("#3b82f6");
      expect(s.esp).toBe(7);
    });
  });

  describe("transladarShapes (recorte em (dx,dy))", () => {
    it("desloca todos os tipos de shape", () => {
      const shapes: Shape[] = [
        { tipo: "caneta", pontos: [{ x: 30, y: 40 }], cor: "#000", esp: 2 },
        { tipo: "elipse", x1: 30, y1: 40, x2: 50, y2: 60, cor: "#000", esp: 2 },
        { tipo: "texto", x: 30, y: 40, texto: "t", cor: "#000", tam: 16 },
      ];
      const out = transladarShapes(shapes, 10, 15);
      const [c, e, t] = out;
      if (c.tipo !== "caneta" || e.tipo !== "elipse" || t.tipo !== "texto") throw new Error("tipos mudaram");
      expect(c.pontos[0]).toEqual({ x: 20, y: 25 });
      expect([e.x1, e.y1, e.x2, e.y2]).toEqual([20, 25, 40, 45]);
      expect([t.x, t.y]).toEqual([20, 25]);
    });
  });

  describe("normalizarCorte", () => {
    it("normaliza arrasto invertido (x2 < x1)", () => {
      expect(normalizarCorte({ x1: 80, y1: 60, x2: 20, y2: 10 }, 100, 100)).toEqual({ x: 20, y: 10, w: 60, h: 50 });
    });
    it("clampa aos limites da imagem", () => {
      expect(normalizarCorte({ x1: -10, y1: -5, x2: 150, y2: 90 }, 100, 80)).toEqual({ x: 0, y: 0, w: 100, h: 80 });
    });
    it("rejeita recorte degenerado (< 10 px)", () => {
      expect(normalizarCorte({ x1: 50, y1: 50, x2: 55, y2: 90 }, 100, 100)).toBeNull();
    });
  });

  describe("espessura/tamanho proporcionais", () => {
    it("escala com o maior lado e respeita mínimos", () => {
      expect(espessuraPx(3000, 2000, 1)).toBe(10);
      expect(espessuraPx(100, 80, 1)).toBe(2); // clamp mínimo
      expect(tamanhoTextoPx(3000, 2000, 1)).toBe(100);
      expect(tamanhoTextoPx(100, 80, 1)).toBe(14); // clamp mínimo
    });
  });
});
