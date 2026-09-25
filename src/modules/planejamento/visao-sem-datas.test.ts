import { describe, expect, it } from "vitest";
import { semDatasDaLinha } from "./visao-sem-datas";

const linha = {
  id: "l1",
  nome: "Modelagem estrutural",
  duracaoDias: 12,
  progresso: 40,
  status: "and",
  ehResumo: false,
  atribuicoes: [{ id: "a1" }],
  inicioPrevisto: "2026-10-05",
  fimPrevisto: "2026-10-20",
  inicioBaseline: "2026-10-01",
  fimBaseline: "2026-10-16",
  inicioReal: "2026-10-05",
  fimReal: null,
  restricaoTipo: "iniciar_nao_antes_de",
  restricaoData: "2026-10-05",
  previsaoDesbloqueio: "2026-10-12",
  critica: true,
  folgaTotal: 3,
  folgaLivre: 1,
  conflitoRestricao: true,
  reprogramada: true,
};

describe("semDatasDaLinha (decisão #3)", () => {
  it("tira toda data da linha e o que só existe por causa delas", () => {
    const r = semDatasDaLinha(linha);
    expect(r.inicioPrevisto).toBe("");
    expect(r.fimPrevisto).toBe("");
    expect(r.inicioBaseline).toBeNull();
    expect(r.fimBaseline).toBeNull();
    expect(r.inicioReal).toBeNull();
    expect(r.fimReal).toBeNull();
    expect(r.restricaoTipo).toBeNull();
    expect(r.restricaoData).toBeNull();
    expect(r.previsaoDesbloqueio).toBeNull();
    expect(r.critica).toBe(false);
    expect(r.folgaTotal).toBe(0);
    expect(r.folgaLivre).toBe(0);
    expect(r.conflitoRestricao).toBe(false);
    expect(r.reprogramada).toBe(false);
  });

  it("mantém a estrutura: nome, duração, avanço, situação, pessoas", () => {
    const r = semDatasDaLinha(linha);
    expect(r).toMatchObject({
      id: "l1",
      nome: "Modelagem estrutural",
      duracaoDias: 12,
      progresso: 40,
      status: "and",
      ehResumo: false,
      atribuicoes: [{ id: "a1" }],
    });
  });

  it("nenhum valor que pareça data sobra em lugar nenhum da linha", () => {
    const texto = JSON.stringify(semDatasDaLinha(linha));
    expect(texto).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("não altera a linha original", () => {
    semDatasDaLinha(linha);
    expect(linha.inicioPrevisto).toBe("2026-10-05");
  });
});
