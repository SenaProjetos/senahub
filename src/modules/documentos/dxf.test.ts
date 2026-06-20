import { describe, it, expect } from "vitest";
import { gerarDxf } from "@/modules/documentos/dxf";
import { docVazio, novoElemento, type DocSchema } from "@/modules/documentos/schema";

function schemaSimples(): DocSchema {
  const doc = docVazio();
  const cab = doc.bandas.find((b) => b.tipo === "cabecalho")!;
  const label = { ...novoElemento("label", 0, 10), texto: "CARIMBO" };
  const linha = novoElemento("linha", 0, 40);
  cab.elementos.push(label, linha);
  return doc;
}

describe("gerarDxf", () => {
  it("produz estrutura DXF válida (SECTION/ENTITIES/EOF)", () => {
    const dxf = gerarDxf(schemaSimples());
    expect(dxf).toContain("SECTION");
    expect(dxf).toContain("ENTITIES");
    expect(dxf).toContain("ENDSEC");
    expect(dxf.trimEnd().endsWith("EOF")).toBe(true);
  });

  it("emite TEXT para label e LINE para linha", () => {
    const dxf = gerarDxf(schemaSimples());
    expect(dxf).toContain("TEXT");
    expect(dxf).toContain("CARIMBO");
    expect(dxf).toContain("LINE");
  });

  it("inverte o eixo Y (topo da tela vira Y alto em mm)", () => {
    // elemento no topo (y pequeno em px) → Y em mm alto (perto da altura da página em mm).
    const doc = docVazio(); // A4 retrato, altura ~1123px ≈ 297mm
    const cab = doc.bandas.find((b) => b.tipo === "cabecalho")!;
    cab.elementos.push({ ...novoElemento("label", 0, 0), texto: "TOPO" });
    const dxf = gerarDxf(doc);
    // captura o grupo 20 (Y) do primeiro TEXT
    const linhas = dxf.split("\n");
    const iText = linhas.indexOf("TEXT");
    const i20 = linhas.indexOf("20", iText);
    const y = Number(linhas[i20 + 1]);
    expect(y).toBeGreaterThan(200); // perto do topo da folha (≈297mm), não perto de 0
  });

  it("resolve tokens quando dados são informados", () => {
    const doc = docVazio();
    const cab = doc.bandas.find((b) => b.tipo === "cabecalho")!;
    cab.elementos.push({ ...novoElemento("campo", 0, 10), texto: "[Nome]" });
    const dxf = gerarDxf(doc, { escalar: { Nome: "Projeto X" }, linhas: [] });
    expect(dxf).toContain("Projeto X");
  });
});
