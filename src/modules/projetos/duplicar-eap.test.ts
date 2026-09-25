import { describe, expect, it } from "vitest";
import { clonarEap, type LinhaEapOrigem } from "./duplicar-eap";

const dia = (s: string) => new Date(`${s}T00:00:00.000Z`);

const linha = (id: string, o: Partial<LinhaEapOrigem> = {}): LinhaEapOrigem => ({
  id,
  parentId: null,
  disciplinaId: null,
  nome: `linha ${id}`,
  ordem: 0,
  tipoEap: "atv",
  duracaoDias: 5,
  prioridade: "med",
  etapaId: null,
  tipoAtividadeId: null,
  sistemaId: null,
  localizacaoId: null,
  origemId: null,
  inicioPrevisto: dia("2026-03-02"),
  fimPrevisto: dia("2026-03-06"),
  predecessoras: [],
  ...o,
});

function contexto(ids: string[], extra: Partial<Parameters<typeof clonarEap>[1]> = {}) {
  return {
    projetoId: "novo",
    disciplinaNova: new Map([["D1", "ND1"]]),
    fasesDaDisciplina: new Map([["ND1", new Set(["fase-global"])]]),
    novaLinha: new Map(ids.map((id, i) => [id, { id: `n-${id}`, idCorporativo: `ATV-${String(i + 1).padStart(5, "0")}` }])),
    catalogosGlobais: new Set<string>(),
    ...extra,
  };
}

describe("clonarEap", () => {
  it("copia a estrutura: árvore, tipo, duração, prioridade e nome, com id e ID corporativo novos", () => {
    const origem = [
      linha("R", { tipoEap: "disc", nome: "Elétrica", duracaoDias: 0 }),
      linha("A", { parentId: "R", ordem: 1, duracaoDias: "7.50", prioridade: "alt" }),
      linha("M", { parentId: "R", ordem: 2, tipoEap: "mrc", duracaoDias: 0, nome: "Entrega" }),
    ];
    const { linhas } = clonarEap(origem, contexto(["R", "A", "M"]));
    expect(linhas.map((l) => l.id)).toEqual(["n-R", "n-A", "n-M"]);
    expect(linhas.map((l) => l.idCorporativo)).toEqual(["ATV-00001", "ATV-00002", "ATV-00003"]);
    expect(linhas.map((l) => l.parentId)).toEqual([null, "n-R", "n-R"]);
    expect(linhas.map((l) => l.tipoEap)).toEqual(["disc", "atv", "mrc"]);
    expect(linhas[1]).toMatchObject({ duracaoDias: "7.50", prioridade: "alt", nome: "linha A", ordem: 1, projetoId: "novo" });
    expect(linhas[2]).toMatchObject({ duracaoDias: 0, nome: "Entrega" });
  });

  it("zera avanço e não leva nada do que é do projeto de origem", () => {
    const { linhas } = clonarEap([linha("A", { inicioPrevisto: dia("2026-03-02"), fimPrevisto: dia("2026-03-06") })], contexto(["A"]));
    const l = linhas[0] as Record<string, unknown>;
    expect(l.progresso).toBe(0);
    expect(l.inicioPrevisto).toEqual(dia("2026-03-02"));
    for (const campo of [
      "status", "inicioReal", "fimReal", "inicioBaseline", "fimBaseline",
      "restricaoTipo", "restricaoData", "motivoBloqueio", "previsaoDesbloqueio", "codigoEap",
    ]) {
      expect(l, campo).not.toHaveProperty(campo);
    }
  });

  it("disciplina vai para a do clone; sem correspondente, fica sem disciplina", () => {
    const { linhas } = clonarEap(
      [linha("A", { disciplinaId: "D1" }), linha("B", { disciplinaId: "D-fora" }), linha("C")],
      contexto(["A", "B", "C"]),
    );
    expect(linhas.map((l) => l.disciplinaId)).toEqual(["ND1", null, null]);
  });

  it("classificadores só valem se forem do catálogo global; a fase vem junto com a disciplina que a tem", () => {
    const origem = [
      linha("A", {
        disciplinaId: "D1", etapaId: "fase-global", tipoAtividadeId: "tat-global",
        sistemaId: "sis-do-projeto", localizacaoId: "loc-global", origemId: "org-do-projeto",
      }),
    ];
    const { linhas } = clonarEap(origem, contexto(["A"], { catalogosGlobais: new Set(["tat-global", "loc-global"]) }));
    expect(linhas[0]).toMatchObject({
      etapaId: "fase-global", tipoAtividadeId: "tat-global", sistemaId: null, localizacaoId: "loc-global", origemId: null,
    });
  });

  it("fase que a disciplina do clone não tem não é copiada — ficaria invisível na tela", () => {
    const { linhas } = clonarEap(
      [linha("A", { disciplinaId: "D1", etapaId: "fase-que-a-disciplina-nao-tem" })],
      contexto(["A"]),
    );
    expect(linhas[0].etapaId).toBeNull();
  });

  it("fase sem disciplina não é copiada (a fase só existe ligada a uma disciplina)", () => {
    const { linhas } = clonarEap([linha("A", { disciplinaId: null, etapaId: "fase-global" })], contexto(["A"]));
    expect(linhas[0].etapaId).toBeNull();
  });

  it("dependências levam tipo e defasagem, e só entre linhas copiadas", () => {
    const origem = [
      linha("A"),
      linha("B", { predecessoras: [{ predecessoraId: "A", tipo: "ss", lagDias: "-2" }] }),
      linha("C", { predecessoras: [{ predecessoraId: "A", tipo: "fs", lagDias: 3 }, { predecessoraId: "FORA", tipo: "ff", lagDias: 0 }] }),
    ];
    const { dependencias } = clonarEap(origem, contexto(["A", "B", "C"]));
    expect(dependencias).toEqual([
      { tarefaId: "n-B", predecessoraId: "n-A", tipo: "ss", lagDias: "-2" },
      { tarefaId: "n-C", predecessoraId: "n-A", tipo: "fs", lagDias: 3 },
    ]);
  });

  it("pai fora do conjunto vira raiz em vez de apontar para o projeto antigo", () => {
    const { linhas } = clonarEap([linha("A", { parentId: "PAI-FORA" })], contexto(["A"]));
    expect(linhas[0].parentId).toBeNull();
  });
});
