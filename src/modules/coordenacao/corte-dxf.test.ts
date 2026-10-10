import { describe, expect, it } from "vitest";
import {
  gerarDxfDoCorte,
  nomeDeCamada,
  nomeDoArquivoDeCorte,
  pontoNoDesenho,
  type SegmentoMundo,
} from "@/modules/coordenacao/corte-dxf";
import { ifcParaThree, type Vec3 } from "@/modules/coordenacao/viewer/coords";

/** Ponto do arquivo IFC (metros) no mundo do viewer, sem deslocamento de base. */
const mundo = (ifc: Vec3): Vec3 => ifcParaThree(ifc);

describe("pontoNoDesenho", () => {
  it("planta (corte em Z): x = X, y = Y, em mm", () => {
    expect(pontoNoDesenho(mundo([1.5, 2, 3]), "z", null)).toEqual({ x: 1500, y: 2000 });
  });
  it("corte em Y (frontal): x = X, y = Z", () => {
    expect(pontoNoDesenho(mundo([1.5, 2, 3]), "y", null)).toEqual({ x: 1500, y: 3000 });
  });
  it("corte em X (lateral direita): x = Y, y = Z", () => {
    expect(pontoNoDesenho(mundo([1.5, 2, 3]), "x", null)).toEqual({ x: 2000, y: 3000 });
  });
  it("desconta a base do viewer: volta às coordenadas do arquivo", () => {
    const base = [-100, 0, 50]; // espaço three
    const m = mundo([10, 20, 0]);
    expect(pontoNoDesenho([m[0] + base[0], m[1] + base[1], m[2] + base[2]], "z", base)).toEqual({ x: 10000, y: 20000 });
  });
});

describe("gerarDxfDoCorte", () => {
  const seg = (a: Vec3, b: Vec3): SegmentoMundo => [mundo(a), mundo(b)];

  it("uma camada por modelo, linhas em mm, ruído fora", () => {
    const { dxf, linhas } = gerarDxfDoCorte({
      eixo: "z",
      base: null,
      camadas: [
        { nome: "Recebido do cliente · 2631-ARÇ-ARQ.ifc", segmentos: [seg([0, 0, 1], [4, 0, 1]), seg([1, 1, 1], [1, 1, 1])] },
        { nome: "EST.ifc", segmentos: [seg([0, 0, 1], [0, 3, 1])] },
      ],
    });
    expect(linhas).toBe(2);
    expect(dxf).toContain("2631-ARC-ARQ");
    expect(dxf).toContain("EST");
    expect(dxf).toContain("4000");
    expect(dxf.trim().endsWith("EOF")).toBe(true);
  });
});

describe("nomes", () => {
  it("camada: último trecho, sem acento nem extensão, até 31 caracteres", () => {
    expect(nomeDeCamada("Recebido do cliente · 2631-ARÇ-EST-BS-RVT-308.ifc")).toBe("2631-ARC-EST-BS-RVT-308");
    expect(nomeDeCamada("x".repeat(40)).length).toBe(31);
    expect(nomeDeCamada("···")).toBe("CORTE");
  });
  it("arquivo: planta para corte em Z, corte-x/y nos outros", () => {
    expect(nomeDoArquivoDeCorte("260027", "z")).toBe("260027-planta.dxf");
    expect(nomeDoArquivoDeCorte("P 01/A", "x")).toBe("P_01_A-corte-x.dxf");
  });
});
