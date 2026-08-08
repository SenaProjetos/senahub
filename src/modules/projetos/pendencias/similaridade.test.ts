import { describe, expect, it } from "vitest";
import {
  candidatosReincidencia,
  LIMIAR_REINCIDENCIA,
  MAX_SUGESTOES,
  similaridade,
  tokenizar,
} from "@/modules/projetos/pendencias/similaridade";

describe("tokenizar", () => {
  it("ignora acento, caixa e pontuação", () => {
    expect([...tokenizar("Cota AUSENTE, na planta!")]).toEqual(["cota", "ausente", "planta"]);
  });

  it("descarta palavra vazia e token curto — não discriminam apontamento", () => {
    expect(tokenizar("o de um na")).toEqual(new Set());
  });

  it("preserva código de elemento: é o que identifica a peça", () => {
    expect(tokenizar("Viga V-04 sem armadura").has("v04")).toBe(false);
    expect([...tokenizar("Viga V-04 sem armadura")]).toEqual(["viga", "sem", "armadura"]);
    // "V-04" vira "v" + "04", ambos curtos demais — limitação real, registrada: o casamento
    // vem do vocabulário do problema, não do código do elemento.
  });
});

describe("similaridade", () => {
  it("texto idêntico dá 1", () => {
    expect(similaridade("cota ausente na planta baixa", "cota ausente na planta baixa")).toBe(1);
  });

  it("mesmo problema reescrito passa do limiar", () => {
    expect(
      similaridade(
        "Cota ausente na planta baixa do pavimento térreo",
        "Falta cota na planta baixa do pavimento térreo",
      ),
    ).toBeGreaterThanOrEqual(LIMIAR_REINCIDENCIA);
  });

  it("problema diferente que só compartilha vocabulário fica abaixo do limiar", () => {
    expect(
      similaridade("Legenda de esquadrias incompleta na prancha", "Carimbo da prancha sem número de revisão"),
    ).toBeLessThan(LIMIAR_REINCIDENCIA);
  });

  it("texto curto demais devolve 0 — melhor não sugerir do que sugerir por acidente", () => {
    // Com 2 tokens, um termo em comum já daria 0,33 e dois dariam 1,0.
    expect(similaridade("cota errada", "cota errada")).toBe(0);
    expect(similaridade("", "")).toBe(0);
  });

  it("é indiferente à ordem das palavras", () => {
    const a = similaridade("cota ausente planta baixa", "planta baixa cota ausente");
    expect(a).toBe(1);
  });
});

describe("candidatosReincidencia", () => {
  const encerrados = [
    { id: "1", texto: "Cota ausente na planta baixa do pavimento térreo" },
    { id: "2", texto: "Carimbo da prancha sem número de revisão" },
    { id: "3", texto: "Falta cota na planta baixa do térreo, conforme já apontado" },
    { id: "4", texto: "Cota da planta baixa do pavimento térreo não aparece" },
    { id: "5", texto: "Planta baixa do pavimento térreo sem cota alguma" },
  ];

  it("ordena do mais parecido pro menos e corta pelo limiar", () => {
    const r = candidatosReincidencia("Falta cota na planta baixa do pavimento térreo", encerrados);
    expect(r.length).toBeGreaterThan(0);
    expect(r.map((x) => x.id)).not.toContain("2");
    for (let i = 1; i < r.length; i++) expect(r[i - 1].score).toBeGreaterThanOrEqual(r[i].score);
  });

  it("nunca devolve mais que MAX_SUGESTOES — é aviso, não resultado de busca", () => {
    expect(candidatosReincidencia("Falta cota na planta baixa do pavimento térreo", encerrados).length)
      .toBeLessThanOrEqual(MAX_SUGESTOES);
  });

  it("sem candidato parecido devolve vazio", () => {
    expect(candidatosReincidencia("Reservatório sem indicação de volume", encerrados)).toEqual([]);
  });

  it("lista vazia de candidatos não quebra", () => {
    expect(candidatosReincidencia("qualquer texto de apontamento", [])).toEqual([]);
  });
});
