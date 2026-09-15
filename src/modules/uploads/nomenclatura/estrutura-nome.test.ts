import { describe, expect, it } from "vitest";
import {
  lerCodigoProjetoNoInicio,
  removerDatas,
  removerSufixosDeCopia,
  revisaoDaParte,
} from "./estrutura-nome";

describe("removerSufixosDeCopia", () => {
  it("tira o sufixo de cópia do AltoQi e devolve data e sequência", () => {
    const r = removerSufixosDeCopia("BELA BEACH [cópia 2026-09-14_05]");
    expect(r.base).toBe("BELA BEACH");
    expect(r.copia).toEqual({ data: "2026-09-14", sequencia: 5 });
  });

  it("aceita cópia sem acento", () => {
    expect(removerSufixosDeCopia("260013_ELE-QI [copia 2026-05-29_02]").base).toBe("260013_ELE-QI");
  });

  it("tira duplicata do Windows", () => {
    expect(removerSufixosDeCopia("260018 - Fundação Pousada (2)")).toMatchObject({
      base: "260018 - Fundação Pousada",
      duplicata: true,
    });
    expect(removerSufixosDeCopia("planta - Cópia").base).toBe("planta");
  });

  it("empilha sufixos", () => {
    const r = removerSufixosDeCopia("modelo [cópia 2026-08-20_02] (2)");
    expect(r.base).toBe("modelo");
    expect(r.copia?.sequencia).toBe(2);
    expect(r.duplicata).toBe(true);
  });

  it("não come nome que é só um número entre parênteses", () => {
    expect(removerSufixosDeCopia("(2)").base).toBe("(2)");
  });

  it("deixa o nome intacto quando não há sufixo", () => {
    expect(removerSufixosDeCopia("260020-EST-EX-4000-DET-R00")).toEqual({
      base: "260020-EST-EX-4000-DET-R00",
      copia: null,
      duplicata: false,
    });
  });
});

describe("removerDatas", () => {
  it("tira data ISO, data brasileira e carimbo de data/hora", () => {
    expect(removerDatas("relatorio-2026-09-15").datas).toEqual(["2026-09-15"]);
    expect(removerDatas("laudo_06.07.2026").datas).toEqual(["2026-07-06"]);
    expect(removerDatas("PICTS-ELE-EX-19_06_26-R00").datas).toEqual(["2026-06-19"]);
    expect(removerDatas("20231123140856-LSB-PAP-PCI").datas).toEqual(["2023-11-23"]);
  });

  it("não confunde número de prancha com data", () => {
    const r = removerDatas("260020-EST-EX-4000-DET-R00");
    expect(r.datas).toEqual([]);
    expect(r.texto).toBe("260020-EST-EX-4000-DET-R00");
  });

  it("ignora sequência que não forma data válida", () => {
    expect(removerDatas("ARQ-LZ361-45-99-2026").datas).toEqual([]);
  });
});

describe("revisaoDaParte", () => {
  it("lê as escritas de revisão", () => {
    expect(revisaoDaParte("R00")).toBe(0);
    expect(revisaoDaParte("RV3")).toBe(3);
    expect(revisaoDaParte("REV02")).toBe(2);
    expect(revisaoDaParte("REVISAO01")).toBe(1);
  });

  it("número isolado nunca é revisão", () => {
    expect(revisaoDaParte("4001")).toBeNull();
    expect(revisaoDaParte("02")).toBeNull();
  });
});

describe("lerCodigoProjetoNoInicio", () => {
  it("lê ano + sequencial nos tamanhos que produção usa", () => {
    expect(lerCodigoProjetoNoInicio("2527_EST_EX", 2026)).toMatchObject({ ano: 25, sequencial: 27 });
    expect(lerCodigoProjetoNoInicio("26013-ELE-EX", 2026)).toMatchObject({ ano: 26, sequencial: 13 });
    expect(lerCodigoProjetoNoInicio("260032-EST-EX", 2026)).toMatchObject({ ano: 26, sequencial: 32 });
    expect(lerCodigoProjetoNoInicio("253-PIL-VIG", 2026)).toMatchObject({ ano: 25, sequencial: 3 });
  });

  it("lê subprojeto com ponto e com hífen", () => {
    expect(lerCodigoProjetoNoInicio("26001.1-EST-EX", 2026)).toMatchObject({ ano: 26, sequencial: 1, subprojeto: 1 });
    expect(lerCodigoProjetoNoInicio("26001-4-EST-EX", 2026)).toMatchObject({ ano: 26, sequencial: 1, subprojeto: 4 });
  });

  it("aceita prefixo PRJ/P", () => {
    expect(lerCodigoProjetoNoInicio("PRJ-2503-EST", 2026)).toMatchObject({ ano: 25, sequencial: 3 });
  });

  it("recusa número implausível como ano (5000-Elétrico não é projeto de 2050)", () => {
    expect(lerCodigoProjetoNoInicio("5000-Elétrico", 2026)).toBeNull();
  });

  it("recusa quando o nome não começa com número", () => {
    expect(lerCodigoProjetoNoInicio("CGA_GAS-SPD-PE", 2026)).toBeNull();
  });
});
