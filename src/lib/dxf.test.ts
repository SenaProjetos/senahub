import { describe, it, expect } from "vitest";
import {
  fmt,
  entidadeTexto,
  entidadeLinha,
  entidadeCirculo,
  entidadeArco,
  entidadePolilinha,
  geometriaCotaLinear,
  DxfDocumento,
  AlinhamentoH,
  AlinhamentoV,
} from "./dxf";

/** Lê o valor que segue um group code dentro de um array plano [code, valor, ...]. */
function valorDe(grupos: string[], code: string, ocorrencia = 1): string | undefined {
  let n = 0;
  for (let i = 0; i < grupos.length - 1; i += 2) {
    if (grupos[i] === code) {
      n++;
      if (n === ocorrencia) return grupos[i + 1];
    }
  }
  return undefined;
}

function contar(grupos: string[], code: string, valor: string): number {
  let n = 0;
  for (let i = 0; i < grupos.length - 1; i += 2) {
    if (grupos[i] === code && grupos[i + 1] === valor) n++;
  }
  return n;
}

describe("fmt", () => {
  it("remove zeros à direita supérfluos", () => {
    expect(fmt(100)).toBe("100");
    expect(fmt(100.5)).toBe("100.5");
    expect(fmt(1.2300000)).toBe("1.23");
  });
  it("normaliza -0 para 0", () => {
    expect(fmt(-0)).toBe("0");
  });
  it("não usa notação científica para valores normais de mm", () => {
    expect(fmt(0.0001)).toBe("0.0001");
    expect(fmt(123456.789)).toBe("123456.789");
  });
  it("respeita casas decimais", () => {
    expect(fmt(100, 1)).toBe("100");
    expect(fmt(100.25, 1)).toBe("100.3");
  });
  it("lança para NaN/Infinity", () => {
    expect(() => fmt(NaN)).toThrow();
    expect(() => fmt(Infinity)).toThrow();
  });
});

describe("entidadeTexto", () => {
  it("emite TEXT com ponto, altura e conteúdo", () => {
    const g = entidadeTexto({ x: 10, y: 20 }, 2.5, "Olá");
    expect(g[0]).toBe("0");
    expect(g[1]).toBe("TEXT");
    expect(valorDe(g, "8")).toBe("0"); // camada padrão
    expect(valorDe(g, "10")).toBe("10");
    expect(valorDe(g, "20")).toBe("20");
    expect(valorDe(g, "40")).toBe("2.5");
    expect(valorDe(g, "1")).toBe("Olá");
  });
  it("troca quebras de linha por espaço", () => {
    const g = entidadeTexto({ x: 0, y: 0 }, 1, "linha1\nlinha2");
    expect(valorDe(g, "1")).toBe("linha1 linha2");
  });
  it("inclui rotação e alinhamento quando informados", () => {
    const g = entidadeTexto({ x: 0, y: 0 }, 1, "x", {
      rotacao: 90,
      alinhamentoH: AlinhamentoH.centro,
      alinhamentoV: AlinhamentoV.meio,
    });
    expect(valorDe(g, "50")).toBe("90");
    expect(valorDe(g, "72")).toBe("1");
    expect(valorDe(g, "73")).toBe("2");
    expect(valorDe(g, "11")).toBe("0"); // ponto de alinhamento presente
  });
  it("usa a camada informada", () => {
    const g = entidadeTexto({ x: 0, y: 0 }, 1, "x", { camada: "TEXTOS" });
    expect(valorDe(g, "8")).toBe("TEXTOS");
  });
});

describe("entidadeLinha", () => {
  it("emite LINE com início e fim", () => {
    const g = entidadeLinha({ x: 0, y: 0 }, { x: 100, y: 50 });
    expect(g[1]).toBe("LINE");
    expect(valorDe(g, "10")).toBe("0");
    expect(valorDe(g, "20")).toBe("0");
    expect(valorDe(g, "11")).toBe("100");
    expect(valorDe(g, "21")).toBe("50");
  });
});

describe("entidadeCirculo", () => {
  it("emite CIRCLE com centro e raio", () => {
    const g = entidadeCirculo({ x: 5, y: 5 }, 10);
    expect(g[1]).toBe("CIRCLE");
    expect(valorDe(g, "10")).toBe("5");
    expect(valorDe(g, "20")).toBe("5");
    expect(valorDe(g, "40")).toBe("10");
  });
  it("rejeita raio não-positivo", () => {
    expect(() => entidadeCirculo({ x: 0, y: 0 }, 0)).toThrow();
    expect(() => entidadeCirculo({ x: 0, y: 0 }, -1)).toThrow();
  });
});

describe("entidadeArco", () => {
  it("emite ARC com raio e ângulos inicial/final", () => {
    const g = entidadeArco({ x: 0, y: 0 }, 20, 0, 90);
    expect(g[1]).toBe("ARC");
    expect(valorDe(g, "40")).toBe("20");
    expect(valorDe(g, "50")).toBe("0");
    expect(valorDe(g, "51")).toBe("90");
  });
});

describe("entidadePolilinha", () => {
  it("emite POLYLINE com 66=1, VERTEX por ponto e SEQEND", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    const g = entidadePolilinha(pts);
    expect(g[1]).toBe("POLYLINE");
    expect(valorDe(g, "66")).toBe("1");
    expect(contar(g, "0", "VERTEX")).toBe(3);
    expect(contar(g, "0", "SEQEND")).toBe(1);
  });
  it("marca fechada com flag 70=1", () => {
    const g = entidadePolilinha([{ x: 0, y: 0 }, { x: 1, y: 1 }], { fechada: true });
    expect(valorDe(g, "70")).toBe("1");
  });
  it("aberta tem flag 70=0", () => {
    const g = entidadePolilinha([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
    expect(valorDe(g, "70")).toBe("0");
  });
  it("rejeita menos de 2 pontos", () => {
    expect(() => entidadePolilinha([{ x: 0, y: 0 }])).toThrow();
  });
});

describe("geometriaCotaLinear", () => {
  it("cota horizontal: linha de cota no afastamento e texto com o comprimento", () => {
    const g = geometriaCotaLinear({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
    // 5 linhas (2 extensões + 1 cota + 2 ticks) + 1 texto
    expect(contar(g, "0", "LINE")).toBe(5);
    expect(contar(g, "0", "TEXT")).toBe(1);
    // O texto medido é "100"
    expect(valorDe(g, "1")).toBe("100");
  });
  it("usa rótulo manual quando fornecido", () => {
    const g = geometriaCotaLinear({ x: 0, y: 0 }, { x: 50, y: 0 }, 10, { texto: "VÃO" });
    expect(valorDe(g, "1")).toBe("VÃO");
  });
  it("respeita casas decimais do comprimento", () => {
    const g = geometriaCotaLinear({ x: 0, y: 0 }, { x: 3, y: 4 }, 5, { casas: 2 });
    // hypot(3,4) = 5
    expect(valorDe(g, "1")).toBe("5");
  });
  it("lança quando p1 e p2 coincidem", () => {
    expect(() => geometriaCotaLinear({ x: 1, y: 1 }, { x: 1, y: 1 }, 10)).toThrow(/nulo/i);
  });
});

describe("DxfDocumento", () => {
  it("monta documento com HEADER, TABLES, ENTITIES e EOF", () => {
    const doc = new DxfDocumento();
    doc.linha({ x: 0, y: 0 }, { x: 100, y: 0 });
    const dxf = doc.toString();
    expect(dxf).toContain("AC1009");
    expect(dxf).toContain("SECTION");
    expect(dxf).toContain("ENTITIES");
    expect(dxf).toContain("TABLES");
    expect(dxf.trimEnd().endsWith("EOF")).toBe(true);
  });

  it("sempre inclui a camada 0 e declara camadas usadas", () => {
    const doc = new DxfDocumento();
    doc.camada("EIXOS", 1);
    doc.linha({ x: 0, y: 0 }, { x: 1, y: 1 }, { camada: "EIXOS" });
    const grupos = doc.toString().split("\n");
    // tabela LAYER deve conter "0" e "EIXOS"
    expect(contar(grupos, "2", "0")).toBeGreaterThanOrEqual(1);
    expect(contar(grupos, "2", "EIXOS")).toBe(1);
    // cor da camada EIXOS = 1
    const idx = grupos.indexOf("EIXOS");
    expect(grupos[idx + 1]).toBe("70");
  });

  it("auto-registra camada referenciada sem declaração prévia", () => {
    const doc = new DxfDocumento();
    doc.circulo({ x: 0, y: 0 }, 5, { camada: "FUROS" });
    const grupos = doc.toString().split("\n");
    expect(contar(grupos, "2", "FUROS")).toBe(1);
  });

  it("conta de camadas (group 70 da tabela LAYER) bate com o número de camadas", () => {
    const doc = new DxfDocumento();
    doc.camada("A", 1).camada("B", 2);
    const dxf = doc.toString();
    // 3 camadas: 0, A, B
    const grupos = dxf.split("\n");
    // localizar a TABLE LAYER e ler o 70 imediatamente após
    const iLayer = grupos.findIndex((v, i) => v === "LAYER" && grupos[i - 1] === "2");
    // o 70 da contagem vem depois do "2 LAYER"
    const i70 = grupos.indexOf("70", iLayer);
    expect(grupos[i70 + 1]).toBe("3");
  });

  it("encadeia múltiplas entidades", () => {
    const doc = new DxfDocumento()
      .linha({ x: 0, y: 0 }, { x: 10, y: 0 })
      .circulo({ x: 5, y: 5 }, 2)
      .arco({ x: 0, y: 0 }, 8, 0, 180)
      .polilinha([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }], { fechada: true })
      .cotaLinear({ x: 0, y: 0 }, { x: 10, y: 0 }, -5);
    const grupos = doc.toString().split("\n");
    expect(contar(grupos, "0", "LINE")).toBeGreaterThanOrEqual(1);
    expect(contar(grupos, "0", "CIRCLE")).toBe(1);
    expect(contar(grupos, "0", "ARC")).toBe(1);
    expect(contar(grupos, "0", "POLYLINE")).toBe(1);
    // cota cria sua própria camada COTAS
    expect(contar(grupos, "2", "COTAS")).toBe(1);
  });
});
