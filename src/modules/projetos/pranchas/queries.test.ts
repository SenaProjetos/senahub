import { describe, expect, it } from "vitest";
import { mapaCanonico, canonizar } from "./queries";

describe("mapaCanonico / canonizar (F4 — dedup da Lista Mestre)", () => {
  const catalogoTipo = [{ sigla: "DET", sinonimos: ["DTC", "DE"] }];
  const mapa = mapaCanonico(catalogoTipo);

  it("sinônimo vira a sigla canônica do catálogo", () => {
    expect(canonizar("DTC", mapa)).toBe("DET");
    expect(canonizar("DE", mapa)).toBe("DET");
  });

  it("a própria sigla canônica volta nela mesma", () => {
    expect(canonizar("DET", mapa)).toBe("DET");
  });

  it("sigla sem catálogo correspondente só maiusculiza, não inventa", () => {
    expect(canonizar("XYZ", mapa)).toBe("XYZ");
  });

  it("entrada em minúsculo casa igual — Prancha antiga não garante caixa alta", () => {
    expect(canonizar("dtc", mapa)).toBe("DET");
    expect(canonizar("det", mapa)).toBe("DET");
  });
});
