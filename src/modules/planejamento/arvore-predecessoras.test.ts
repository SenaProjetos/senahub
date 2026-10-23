import { describe, expect, it } from "vitest";
import {
  MOTIVO_PRED_CICLO,
  MOTIVO_PRED_DESCENDENTE,
  MOTIVO_PRED_MAE,
  MOTIVO_PRED_PROPRIA,
  aplicarEscolha,
  opcoesDePredecessora,
} from "./arvore-predecessoras";
import type { Vinculo } from "./gantt-linhas";

const linha = (id: string, parentId: string | null, ordem: number, codigo: string, nome = id, tipoEap = "atv") => ({ id, parentId, ordem, codigo, nome, tipoEap });

// 1 P
//   1.1 A (A1 = 1.1.1)   1.2 B   1.3 C
// 2 Q
const linhas = [
  linha("P", null, 0, "1"),
  linha("A", "P", 1, "1.1"),
  linha("A1", "A", 2, "1.1.1"),
  linha("B", "P", 3, "1.2"),
  linha("C", "P", 4, "1.3"),
  linha("Q", null, 5, "2"),
];

const por = (r: ReturnType<typeof opcoesDePredecessora>, id: string) => r.find((o) => o.id === id)!;

describe("opcoesDePredecessora", () => {
  it("lista em ordem de documento, com o nível de cada linha (0 = raiz)", () => {
    const r = opcoesDePredecessora({ linhas, dependencias: [], linhaId: "C" });
    expect(r.map((o) => [o.id, o.nivel, o.codigo])).toEqual([
      ["P", 0, "1"],
      ["A", 1, "1.1"],
      ["A1", 2, "1.1.1"],
      ["B", 1, "1.2"],
      ["C", 1, "1.3"],
      ["Q", 0, "2"],
    ]);
  });

  it("a própria linha sai desabilitada, com a frase", () => {
    expect(por(opcoesDePredecessora({ linhas, dependencias: [], linhaId: "B" }), "B").desabilitada).toBe(MOTIVO_PRED_PROPRIA);
    expect(MOTIVO_PRED_PROPRIA).toBe("Uma tarefa não pode ser predecessora de si mesma.");
  });

  it("subtarefa e tarefa-mãe da linha saem desabilitadas (o vínculo mãe↔filha não existe)", () => {
    const r = opcoesDePredecessora({ linhas, dependencias: [], linhaId: "A" });
    expect(por(r, "A1").desabilitada).toBe(MOTIVO_PRED_DESCENDENTE);
    expect(por(r, "P").desabilitada).toBe(MOTIVO_PRED_MAE);
    expect(por(r, "B").desabilitada).toBeNull();
    expect(por(r, "Q").desabilitada).toBeNull();
  });

  it("quem já depende da linha (direta ou indiretamente) fecharia um ciclo", () => {
    // C depende de B; B depende de A  →  escolher B ou C como predecessora de A fecha ciclo
    const dependencias = [
      { tarefaId: "B", predecessoraId: "A" },
      { tarefaId: "C", predecessoraId: "B" },
    ];
    const r = opcoesDePredecessora({ linhas, dependencias, linhaId: "A" });
    expect(por(r, "B").desabilitada).toBe(MOTIVO_PRED_CICLO);
    expect(por(r, "C").desabilitada).toBe(MOTIVO_PRED_CICLO);
    expect(por(r, "Q").desabilitada).toBeNull();
  });

  it("os vínculos que a PRÓPRIA linha já tem não contam: o conjunto dela é trocado inteiro", () => {
    // B depende de C hoje; ao editar B, escolher C de novo (ou trocar) não é ciclo
    const dependencias = [{ tarefaId: "B", predecessoraId: "C" }];
    expect(por(opcoesDePredecessora({ linhas, dependencias, linhaId: "B" }), "C").desabilitada).toBeNull();
  });
});

describe("aplicarEscolha", () => {
  const atuais: Vinculo[] = [
    { predecessoraId: "A", tipo: "ss", lagDias: 2 },
    { predecessoraId: "B", tipo: "fs", lagDias: 0 },
  ];

  it("mantém o tipo e o atraso de quem já era predecessora", () => {
    expect(aplicarEscolha(atuais, new Set(["A", "B"]))).toEqual(atuais);
  });

  it("tira o que foi desmarcado e põe o novo como término→início sem atraso", () => {
    expect(aplicarEscolha(atuais, new Set(["A", "C"]))).toEqual([
      { predecessoraId: "A", tipo: "ss", lagDias: 2 },
      { predecessoraId: "C", tipo: "fs", lagDias: 0 },
    ]);
  });

  it("nada escolhido tira todas as predecessoras", () => {
    expect(aplicarEscolha(atuais, new Set())).toEqual([]);
  });
});
