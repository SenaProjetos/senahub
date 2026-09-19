import { describe, expect, it } from "vitest";
import { ALTURA_MAX_BANDA, FORMATOS_FOLHA, dimensoesPx, docSchemaZ, docVazio, mmToPx } from "./schema";

/**
 * Limite apertado demais em `docSchemaZ` não dá erro: o modelo salvo passa a ser recusado e, como
 * todo caminho de leitura cai em `docVazio()`, o usuário vê um documento em branco e pode salvar
 * por cima. Estes testes prendem os dois limites que já causaram isso (G0.1).
 */

const estilo = {
  fontSize: 11,
  bold: false,
  italic: false,
  align: "left" as const,
  color: "",
  bg: "",
  borderW: 0,
  borderColor: "#1C2D58",
  borderStyle: "solida" as const,
  radius: 0,
  fontFamily: "",
};

function docCom(alturaBanda: number, h: number) {
  return {
    versao: 1,
    pagina: {
      formato: "A4",
      orientacao: "retrato",
      largura: 794,
      altura: 1123,
      margem: { topo: 48, direita: 48, baixo: 48, esquerda: 48 },
    },
    bandas: [
      {
        id: "b1",
        tipo: "cabecalho",
        altura: alturaBanda,
        elementos: [{ id: "e1", tipo: "linha", x: 0, y: 0, w: 600, h, texto: "", estilo, visivel: true, travado: false }],
      },
    ],
  };
}

describe("limites do schema x modelos já salvos", () => {
  it("aceita banda tão alta quanto a maior folha oferecida pelo editor", () => {
    // O editor oferece até A0; o limite antigo era a altura do A4 e apagava o "Carimbo A0".
    const maiorFolha = Math.max(
      ...Object.keys(FORMATOS_FOLHA).flatMap((f) => [
        dimensoesPx(f, "retrato").altura,
        dimensoesPx(f, "paisagem").altura,
      ]),
    );
    expect(ALTURA_MAX_BANDA).toBeGreaterThanOrEqual(maiorFolha);
    expect(docSchemaZ.safeParse(docCom(maiorFolha, 20)).success).toBe(true);
  });

  it("aceita linha fina (1px e 2px), que existe em modelos de fábrica", () => {
    for (const h of [1, 2, 3]) expect(docSchemaZ.safeParse(docCom(120, h)).success).toBe(true);
  });

  it("A0 retrato cabe no limite", () => {
    expect(ALTURA_MAX_BANDA).toBe(mmToPx(1189));
  });

  it("docVazio continua válido (é o fallback; inválido viraria erro em cascata)", () => {
    expect(docSchemaZ.safeParse(docVazio()).success).toBe(true);
  });
});
