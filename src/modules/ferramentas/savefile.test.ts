import { describe, it, expect } from "vitest";
import { serializar, parse } from "./savefile";

const entradasValidas = { dimensao: "forca", valor: 1, de: "tf", para: "kN" };

describe("savefile — round-trip e validações", () => {
  it("serializa e devolve JSON válido com header correto", () => {
    const json = serializar({
      ferramenta: "conversor-unidades",
      versaoCalc: 1,
      titulo: "Teste TF→kN",
      entradas: entradasValidas,
    });
    const parsed = JSON.parse(json);
    expect(parsed.app).toBe("senahub");
    expect(parsed.kind).toBe("shcalc");
    expect(parsed.ferramenta).toBe("conversor-unidades");
    expect(parsed.titulo).toBe("Teste TF→kN");
    expect(parsed.entradas).toEqual(entradasValidas);
  });

  it("round-trip: serializar → parse retorna os mesmos dados", () => {
    const json = serializar({
      ferramenta: "conversor-unidades",
      versaoCalc: 1,
      titulo: "Meu cálculo",
      norma: undefined,
      entradas: entradasValidas,
    });
    const result = parse(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.ferramenta).toBe("conversor-unidades");
    expect(result.data.versaoCalc).toBe(1);
    expect(result.data.entradas).toEqual(entradasValidas);
  });

  it("round-trip com ferramenta esperada correta", () => {
    const json = serializar({ ferramenta: "conversor-unidades", versaoCalc: 1, titulo: "t", entradas: entradasValidas });
    const result = parse(json, "conversor-unidades");
    expect(result.ok).toBe(true);
  });

  it("rejeita arquivo de outra ferramenta quando ferramentaEsperada está definida", () => {
    const json = serializar({ ferramenta: "conversor-unidades", versaoCalc: 1, titulo: "t", entradas: entradasValidas });
    const result = parse(json, "viga-concreto");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.erro).toMatch(/viga-concreto/);
  });

  it("rejeita JSON inválido", () => {
    const result = parse("não é json {{{");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.erro).toMatch(/JSON/i);
  });

  it("rejeita objeto sem header shcalc", () => {
    const result = parse(JSON.stringify({ foo: "bar" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.erro).toMatch(/shcalc/i);
  });

  it("rejeita entradas incompatíveis com o schema da ferramenta", () => {
    const json = serializar({
      ferramenta: "conversor-unidades",
      versaoCalc: 1,
      titulo: "inválido",
      entradas: { dimensao: "DIMENSAO_INEXISTENTE", valor: "nao_numero", de: "kN", para: "N" },
    });
    const result = parse(json);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.erro).toMatch(/incompatíveis/i);
  });

  it("inclui norma quando fornecida", () => {
    const json = serializar({
      ferramenta: "conversor-unidades",
      versaoCalc: 1,
      titulo: "t",
      norma: "NBR 6118:2023",
      entradas: entradasValidas,
    });
    const result = parse(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.norma).toBe("NBR 6118:2023");
  });
});
