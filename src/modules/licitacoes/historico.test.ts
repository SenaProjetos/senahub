import { describe, it, expect } from "vitest";
import {
  textoMudancaStatus,
  textoUploadDoc,
  textoMedicao,
  textoImportacao,
  textoExclusaoMedicao,
  textoExclusaoVersaoDoc,
} from "./historico";

describe("textoMudancaStatus", () => {
  it("inclui rótulo do status de origem e destino", () => {
    const t = textoMudancaStatus("em_andamento", "ganha");
    expect(t).toContain("Em andamento");
    expect(t).toContain("Ganha");
    expect(t).toContain("→");
  });
});

describe("textoUploadDoc", () => {
  it("inclui título e número de versão", () => {
    const t = textoUploadDoc("ART", 3);
    expect(t).toContain("ART");
    expect(t).toContain("v3");
  });
});

describe("textoMedicao", () => {
  it("inclui número, valor formatado e data", () => {
    const t = textoMedicao(2, 15000, "30/06/2026");
    expect(t).toContain("2");
    expect(t).toContain("15.000");
    expect(t).toContain("30/06/2026");
  });
});

describe("textoImportacao", () => {
  it("inclui código do projeto", () => {
    const t = textoImportacao("AR-26-0001");
    expect(t).toContain("AR-26-0001");
  });
});

describe("textoExclusaoMedicao", () => {
  it("inclui número e valor formatado", () => {
    const t = textoExclusaoMedicao(1, 8000);
    expect(t).toContain("1");
    expect(t).toContain("8.000");
    expect(t).toContain("removida");
  });
});

describe("textoExclusaoVersaoDoc", () => {
  it("inclui título do documento e número de versão", () => {
    const t = textoExclusaoVersaoDoc("Proposta técnica", 2);
    expect(t).toContain("Proposta técnica");
    expect(t).toContain("v2");
    expect(t).toContain("removida");
  });
});
