import { describe, expect, it } from "vitest";
import { MOTIVO_SEM_ESCALA, congelarMarcacao, dadosDoRascunho, type MarcacaoGravada } from "./conversao";

const pagina = { w: 1000, h: 500 };
const calibracao = { mmPorPonto: 2, modo: "escala" as const };

describe("congelarMarcacao", () => {
  it("pino passa sem medida", () => {
    const r = congelarMarcacao({ pagina: 1, x: 0.5, y: 0.5, texto: "aqui", marcacao: null }, { calibracao: null, paginaPt: null });
    expect(r).toEqual({ pagina: 1, x: 0.5, y: 0.5, texto: "aqui", marcacao: null, medida: null });
  });

  it("cota sem calibração é recusada", () => {
    const r = congelarMarcacao(
      { pagina: 1, x: 0.1, y: 0.1, texto: "cota", marcacao: { tipo: "medida", pontos: [{ dx: 0.1, dy: 0 }] } },
      { calibracao: null, paginaPt: pagina },
    );
    expect(r).toEqual({ erro: MOTIVO_SEM_ESCALA });
  });

  it("cota é recalculada no servidor pela calibração (o valor do navegador não vale)", () => {
    const r = congelarMarcacao(
      {
        pagina: 2,
        x: 0.1,
        y: 0.1,
        texto: "cota",
        marcacao: {
          tipo: "medida",
          pontos: [{ dx: 0.1, dy: 0 }],
          medidas: [
            { de: { dx: 0, dy: 0 }, ate: { dx: 0.1, dy: 0 }, mm: 99999 },
            { de: { dx: 0, dy: 0 }, ate: { dx: 0, dy: 0.2 }, mm: 1 },
          ],
        },
      },
      { calibracao, paginaPt: pagina },
    );
    if ("erro" in r) throw new Error(r.erro);
    // 0,1 × 1000 pt = 100 pt × 2 mm/pt = 200 mm; 0,2 × 500 pt = 100 pt = 200 mm.
    expect(r.marcacao?.medidas?.map((m) => Math.round(m.mm))).toEqual([200, 200]);
    expect(r.medida).toEqual({ mm: expect.closeTo(200, 6), fator: 2, modo: "escala" });
  });

  it("cota de um segmento só (sem medidas) também é recalculada", () => {
    const r = congelarMarcacao(
      { pagina: 1, x: 0, y: 0, texto: "c", marcacao: { tipo: "medida", pontos: [{ dx: 0.05, dy: 0 }] } },
      { calibracao, paginaPt: pagina },
    );
    if ("erro" in r) throw new Error(r.erro);
    expect(Math.round(r.medida!.mm)).toBe(100);
  });

  it("retângulo e rabisco ficam como vieram, sem medida", () => {
    const tracos = [[{ dx: 0, dy: 0 }, { dx: 0.1, dy: 0.05 }]];
    const r = congelarMarcacao(
      { pagina: 1, x: 0.2, y: 0.3, texto: "r", marcacao: { tipo: "livre", pontos: [], tracos, estilos: [{ cor: "azul", espessura: 4 }] } },
      { calibracao: null, paginaPt: null },
    );
    expect(r).toMatchObject({ marcacao: { tipo: "livre", tracos }, medida: null });
  });
});

describe("dadosDoRascunho", () => {
  const base: MarcacaoGravada = {
    pagina: 3,
    x: 0.25,
    y: 0.75,
    texto: "Mudar a porta",
    marcacaoTipo: "nuvem",
    marcacaoGeo: { pontos: [{ dx: 0.1, dy: 0.1 }] },
    medidaMm: null,
    medidaFator: null,
    medidaModo: null,
  };

  it("mesma posição e geometria, texto do cliente", () => {
    const d = dadosDoRascunho(base, { nomeAutor: "Mariana Souza", temAnexos: false });
    expect(d).toEqual({
      pagina: 3,
      x: 0.25,
      y: 0.75,
      texto: "Cliente (Mariana): Mudar a porta",
      marcacao: { tipo: "nuvem", pontos: [{ dx: 0.1, dy: 0.1 }] },
      medida: null,
    });
  });

  it("pino (sem geometria) e medida congelada", () => {
    expect(dadosDoRascunho({ ...base, marcacaoTipo: null, marcacaoGeo: null }, { nomeAutor: "A", temAnexos: true }).marcacao).toBeNull();
    const cota = dadosDoRascunho(
      { ...base, marcacaoTipo: "medida", marcacaoGeo: { pontos: [{ dx: 0.1, dy: 0 }] }, medidaMm: 200, medidaFator: 2, medidaModo: "escala" },
      { nomeAutor: "A", temAnexos: false },
    );
    expect(cota.medida).toEqual({ mm: 200, fator: 2, modo: "escala" });
  });

  it("texto do rascunho nunca passa de 1000 caracteres (limite do apontamento)", () => {
    const d = dadosDoRascunho({ ...base, texto: "x".repeat(2000) }, { nomeAutor: "Nome Muito Comprido", temAnexos: true });
    expect(d.texto.length).toBeLessThanOrEqual(1000);
  });
});
