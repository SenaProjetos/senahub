import { describe, it, expect } from "vitest";
import {
  extrairQuantidades,
  escolherQuantidade,
  diagnosticoQuantidades,
  normalizarQuantidades,
  ORDEM_PADRAO_QUANTIDADE,
} from "./quantidades-ifc";

describe("extrairQuantidades", () => {
  it("retorna vazio para item ausente ou não-objeto", () => {
    expect(extrairQuantidades(undefined)).toEqual([]);
    expect(extrairQuantidades(null)).toEqual([]);
    expect(extrairQuantidades("x")).toEqual([]);
    expect(extrairQuantidades({})).toEqual([]);
  });

  it("ignora IsDefinedBy que são Pset (HasProperties, sem Quantities) — não quebra", () => {
    const quantidades = extrairQuantidades({
      Name: { value: "Parede" },
      IsDefinedBy: [
        {
          Name: { value: "Pset_WallCommon" },
          HasProperties: [{ Name: { value: "IsExternal" }, NominalValue: { value: true } }],
        },
      ],
    });
    expect(quantidades).toEqual([]);
  });

  it("extrai Area/Volume/Length de um IfcElementQuantity real (forma da laje do Passo 0)", () => {
    const quantidades = extrairQuantidades({
      Name: { value: "Laje L1" },
      IsDefinedBy: [
        {
          Name: { value: "Qto_SlabBaseQuantities" },
          Quantities: [
            { Name: { value: "GrossArea" }, AreaValue: { value: 12.5 } },
            { Name: { value: "NetArea" }, AreaValue: { value: 11.8 } },
            { Name: { value: "GrossVolume" }, VolumeValue: { value: 1.5 } },
            { Name: { value: "Perimeter" }, LengthValue: { value: 14.2 } },
          ],
        },
      ],
    });
    expect(quantidades).toEqual([
      { grupo: "Qto_SlabBaseQuantities", nome: "GrossArea", grandeza: "area", valor: 12.5 },
      { grupo: "Qto_SlabBaseQuantities", nome: "NetArea", grandeza: "area", valor: 11.8 },
      { grupo: "Qto_SlabBaseQuantities", nome: "GrossVolume", grandeza: "volume", valor: 1.5 },
      { grupo: "Qto_SlabBaseQuantities", nome: "Perimeter", grandeza: "comprimento", valor: 14.2 },
    ]);
  });

  it("extrai contagem e peso", () => {
    const quantidades = extrairQuantidades({
      IsDefinedBy: [
        {
          Name: { value: "Qto_Custom" },
          Quantities: [
            { Name: { value: "Furos" }, CountValue: { value: 4 } },
            { Name: { value: "GrossWeight" }, WeightValue: { value: 320.4 } },
          ],
        },
      ],
    });
    expect(quantidades).toEqual([
      { grupo: "Qto_Custom", nome: "Furos", grandeza: "contagem", valor: 4 },
      { grupo: "Qto_Custom", nome: "GrossWeight", grandeza: "peso", valor: 320.4 },
    ]);
  });

  it("elemento sem nenhum IsDefinedBy → vazio", () => {
    expect(extrairQuantidades({ Name: { value: "Viga sem props" } })).toEqual([]);
  });

  it("grupo sem Name usa rótulo padrão", () => {
    const quantidades = extrairQuantidades({
      IsDefinedBy: [{ Quantities: [{ Name: { value: "Length" }, LengthValue: { value: 3 } }] }],
    });
    expect(quantidades[0].grupo).toBe("Quantidades");
  });

  it("quantity sem Name é descartada; grandeza sem chave reconhecida (IfcQuantityNumber) é ignorada", () => {
    const quantidades = extrairQuantidades({
      IsDefinedBy: [
        {
          Name: { value: "Qto_X" },
          Quantities: [
            { NumberValue: { value: 1 } }, // sem Name → descarta
            { Name: { value: "Fator" }, NumberValue: { value: 2 } }, // grandeza não mapeada → ignora
            { Name: { value: "Length" }, LengthValue: { value: 5 } },
          ],
        },
      ],
    });
    expect(quantidades).toEqual([{ grupo: "Qto_X", nome: "Length", grandeza: "comprimento", valor: 5 }]);
  });

  it("shapes malformados não quebram (Quantities não-array, item nulo na lista, valor não-numérico)", () => {
    expect(() =>
      extrairQuantidades({
        IsDefinedBy: [
          { Name: { value: "A" }, Quantities: "não é array" },
          null,
          { Name: { value: "B" }, Quantities: [null, { Name: { value: "X" }, AreaValue: { value: "abc" } }] },
        ],
      }),
    ).not.toThrow();
    expect(
      extrairQuantidades({
        IsDefinedBy: [{ Name: { value: "B" }, Quantities: [{ Name: { value: "X" }, AreaValue: { value: "abc" } }] }],
      }),
    ).toEqual([]);
  });
});

describe("escolherQuantidade", () => {
  const candidatas = [
    { grupo: "Qto_1", nome: "GrossArea", grandeza: "area" as const, valor: 20 },
    { grupo: "Qto_1", nome: "NetArea", grandeza: "area" as const, valor: 18 },
    { grupo: "Qto_1", nome: "GrossVolume", grandeza: "volume" as const, valor: 5 },
  ];

  it("prefere NetArea sobre GrossArea pela ordem padrão", () => {
    expect(escolherQuantidade(candidatas, "area")).toEqual({
      grupo: "Qto_1",
      nome: "NetArea",
      grandeza: "area",
      valor: 18,
    });
  });

  it("sem candidata da grandeza pedida → null", () => {
    expect(escolherQuantidade(candidatas, "peso")).toBeNull();
  });

  it("respeita preferência explícita passada pelo chamador", () => {
    expect(escolherQuantidade(candidatas, "area", ["GrossArea"])?.nome).toBe("GrossArea");
  });

  it("nome fora da ordem padrão cai em ordem alfabética determinística (não a 1ª da entrada)", () => {
    const semNomesConhecidos = [
      { grupo: "Qto_2", nome: "Zebra", grandeza: "area" as const, valor: 1 },
      { grupo: "Qto_2", nome: "Abacate", grandeza: "area" as const, valor: 2 },
    ];
    expect(escolherQuantidade(semNomesConhecidos, "area")?.nome).toBe("Abacate");
  });

  it("ORDEM_PADRAO_QUANTIDADE está documentada e não é vazia", () => {
    expect(ORDEM_PADRAO_QUANTIDADE.length).toBeGreaterThan(0);
  });
});

describe("normalizarQuantidades", () => {
  const quantidades = [
    { grupo: "Qto_X", nome: "NetArea", grandeza: "area" as const, valor: 12500000 },
    { grupo: "Qto_X", nome: "GrossVolume", grandeza: "volume" as const, valor: 1500000000 },
    { grupo: "Qto_X", nome: "Perimeter", grandeza: "comprimento" as const, valor: 14200 },
    { grupo: "Qto_X", nome: "Furos", grandeza: "contagem" as const, valor: 4 },
  ];

  it("fator 1 (arquivo já em metros) não altera nada", () => {
    expect(normalizarQuantidades(quantidades, 1)).toEqual(quantidades);
  });

  it("fator 0.001 (arquivo em milímetros) converte área ao quadrado e volume ao cubo", () => {
    const normalizado = normalizarQuantidades(quantidades, 0.001);
    expect(normalizado[0].valor).toBeCloseTo(12.5); // mm² → m²: ×0.001²
    expect(normalizado[1].valor).toBeCloseTo(1.5); // mm³ → m³: ×0.001³
    expect(normalizado[2].valor).toBeCloseTo(14.2); // mm → m: ×0.001
  });

  it("contagem não é afetada pelo fator", () => {
    expect(normalizarQuantidades(quantidades, 0.001)[3].valor).toBe(4);
  });
});

describe("diagnosticoQuantidades", () => {
  it("conta em quantos elementos cada grupo+nome aparece, ordenado por frequência", () => {
    const amostra = [
      { IsDefinedBy: [{ Name: { value: "Qto_Slab" }, Quantities: [{ Name: { value: "NetArea" }, AreaValue: { value: 1 } }] }] },
      { IsDefinedBy: [{ Name: { value: "Qto_Slab" }, Quantities: [{ Name: { value: "NetArea" }, AreaValue: { value: 2 } }] }] },
      { IsDefinedBy: [{ Name: { value: "Qto_Wall" }, Quantities: [{ Name: { value: "Length" }, LengthValue: { value: 3 } }] }] },
      { Name: { value: "Sem quantity" } },
    ];
    expect(diagnosticoQuantidades(amostra)).toEqual([
      { grupo: "Qto_Slab", nome: "NetArea", grandeza: "area", elementos: 2 },
      { grupo: "Qto_Wall", nome: "Length", grandeza: "comprimento", elementos: 1 },
    ]);
  });

  it("amostra vazia → vazio", () => {
    expect(diagnosticoQuantidades([])).toEqual([]);
  });

  it("não conta 2x a mesma grupo+nome se o elemento repetir a quantity dentro de si (defensivo)", () => {
    const amostra = [
      {
        IsDefinedBy: [
          {
            Name: { value: "Qto_X" },
            Quantities: [
              { Name: { value: "NetArea" }, AreaValue: { value: 1 } },
              { Name: { value: "NetArea" }, AreaValue: { value: 1.1 } },
            ],
          },
        ],
      },
    ];
    expect(diagnosticoQuantidades(amostra)).toEqual([{ grupo: "Qto_X", nome: "NetArea", grandeza: "area", elementos: 1 }]);
  });
});
