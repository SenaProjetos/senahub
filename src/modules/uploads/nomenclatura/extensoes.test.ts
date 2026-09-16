import { describe, expect, it } from "vitest";
import { EXTENSOES_SENA } from "@/test/catalogo-nomenclatura";
import { classificarExtensao, separarExtensao } from "./extensoes";

describe("separarExtensao", () => {
  it("separa nome e extensão em minúscula", () => {
    expect(separarExtensao("260020-EST-EX-4000-DET.DWG")).toEqual({ base: "260020-EST-EX-4000-DET", extensao: "dwg" });
  });

  it("trata o backup numerado do Revit como extensão própria", () => {
    expect(separarExtensao("modelo.0001.rvt")).toEqual({ base: "modelo", extensao: "0000.rvt" });
    expect(separarExtensao("modelo.rvt").extensao).toBe("rvt");
  });

  it("só corta a última extensão", () => {
    expect(separarExtensao("ESTR. CONC. R02.IFC.log.html")).toEqual({
      base: "ESTR. CONC. R02.IFC.log",
      extensao: "html",
    });
  });

  it("dotfile e nome sem ponto ficam inteiros", () => {
    expect(separarExtensao(".env")).toEqual({ base: ".env", extensao: "" });
    expect(separarExtensao("LEIAME")).toEqual({ base: "LEIAME", extensao: "" });
  });
});

describe("classificarExtensao", () => {
  it("classifica o que está no catálogo", () => {
    expect(classificarExtensao("qibzip", EXTENSOES_SENA)).toMatchObject({
      conhecida: true,
      software: "AltoQi",
      ehBackup: true,
      ehConteiner: true,
    });
    expect(classificarExtensao("bak", EXTENSOES_SENA).ehBackup).toBe(true);
  });

  it("zip/rar são contêiner E backup — decisão do dono em 2026-09-16", () => {
    expect(classificarExtensao("zip", EXTENSOES_SENA)).toMatchObject({ ehConteiner: true, ehBackup: true });
    expect(classificarExtensao("rar", EXTENSOES_SENA)).toMatchObject({ ehConteiner: true, ehBackup: true });
  });

  it("extensão desconhecida não vira erro nem categoria inventada", () => {
    expect(classificarExtensao("novoformato", EXTENSOES_SENA)).toEqual({
      conhecida: false,
      categoria: null,
      software: null,
      ehBackup: false,
      ehTemporario: false,
      ehConteiner: false,
    });
  });
});
