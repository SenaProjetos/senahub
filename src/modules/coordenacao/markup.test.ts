import { describe, expect, it } from "vitest";
import {
  criarSeta,
  criarCirculo,
  criarTexto,
  formaValida,
  serializarFormas,
  desserializarFormas,
} from "@/modules/coordenacao/markup";

describe("criarSeta", () => {
  it("guarda início e fim", () => {
    const s = criarSeta({ x: 0, y: 0 }, { x: 10, y: 10 });
    expect(s).toEqual({ tipo: "seta", inicio: { x: 0, y: 0 }, fim: { x: 10, y: 10 } });
  });
});

describe("criarCirculo", () => {
  it("calcula raio pela distância centro→borda", () => {
    const c = criarCirculo({ x: 0, y: 0 }, { x: 3, y: 4 });
    expect(c.raio).toBe(5); // 3-4-5
  });
});

describe("criarTexto", () => {
  it("guarda posição e texto", () => {
    expect(criarTexto({ x: 1, y: 2 }, "nota")).toEqual({ tipo: "texto", posicao: { x: 1, y: 2 }, texto: "nota" });
  });
});

describe("formaValida", () => {
  it("seta muito curta é inválida", () => {
    expect(formaValida(criarSeta({ x: 0, y: 0 }, { x: 1, y: 0 }))).toBe(false);
    expect(formaValida(criarSeta({ x: 0, y: 0 }, { x: 5, y: 0 }))).toBe(true);
  });
  it("círculo muito pequeno é inválido", () => {
    expect(formaValida(criarCirculo({ x: 0, y: 0 }, { x: 1, y: 0 }))).toBe(false);
    expect(formaValida(criarCirculo({ x: 0, y: 0 }, { x: 5, y: 0 }))).toBe(true);
  });
  it("texto vazio (ou só espaços) é inválido", () => {
    expect(formaValida(criarTexto({ x: 0, y: 0 }, "   "))).toBe(false);
    expect(formaValida(criarTexto({ x: 0, y: 0 }, "ok"))).toBe(true);
  });
});

describe("serializarFormas / desserializarFormas", () => {
  it("round-trip preserva as formas", () => {
    const formas = [criarSeta({ x: 0, y: 0 }, { x: 5, y: 5 }), criarTexto({ x: 1, y: 1 }, "abc")];
    const json = serializarFormas(formas);
    expect(desserializarFormas(json)).toEqual(formas);
  });

  it("JSON inválido retorna vazio", () => {
    expect(desserializarFormas("{isso não é json")).toEqual([]);
  });

  it("JSON válido mas não-array retorna vazio", () => {
    expect(desserializarFormas('{"a":1}')).toEqual([]);
  });
});
