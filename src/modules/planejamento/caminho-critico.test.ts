import { describe, it, expect } from "vitest";
import { calcularCaminhoCritico, type TarefaCPM } from "@/modules/planejamento/caminho-critico";

/** Helper: tarefa com início e duração (dias) — gera fimPrevisto inclusivo. */
function tarefa(id: string, inicio: string, dias: number, predecessoraIds: string[] = []): TarefaCPM {
  const ini = new Date(inicio + "T00:00:00");
  const fim = new Date(ini.getTime() + (dias - 1) * 86_400_000);
  return {
    id,
    inicioPrevisto: inicio,
    fimPrevisto: fim.toISOString().slice(0, 10),
    predecessoraIds,
  };
}

describe("calcularCaminhoCritico (CPM)", () => {
  it("vazio retorna sem críticas", () => {
    const r = calcularCaminhoCritico([]);
    expect(r.criticas.size).toBe(0);
    expect(r.folgaPorId.size).toBe(0);
  });

  it("tarefa única é crítica (folga 0)", () => {
    const r = calcularCaminhoCritico([tarefa("A", "2026-01-01", 3)]);
    expect([...r.criticas]).toEqual(["A"]);
    expect(r.folgaPorId.get("A")).toBe(0);
  });

  it("cadeia linear: todas críticas", () => {
    // A(2) → B(3) → C(1)
    const tarefas = [
      tarefa("A", "2026-01-01", 2),
      tarefa("B", "2026-01-03", 3, ["A"]),
      tarefa("C", "2026-01-06", 1, ["B"]),
    ];
    const r = calcularCaminhoCritico(tarefas);
    expect(r.criticas).toEqual(new Set(["A", "B", "C"]));
  });

  it("grafo com ramo paralelo: o caminho mais longo é crítico, o curto tem folga", () => {
    // Início → A → C  e  Início → B → C
    //   A dura 5, B dura 2; ambas levam a C (dura 2).
    //   Caminho A→C = 7, B→C = 4. A é crítico; B tem folga 3.
    const tarefas: TarefaCPM[] = [
      tarefa("A", "2026-01-01", 5),
      tarefa("B", "2026-01-01", 2),
      tarefa("C", "2026-01-06", 2, ["A", "B"]),
    ];
    const r = calcularCaminhoCritico(tarefas);
    expect(r.criticas.has("A")).toBe(true);
    expect(r.criticas.has("C")).toBe(true);
    expect(r.criticas.has("B")).toBe(false);
    expect(r.folgaPorId.get("A")).toBe(0);
    expect(r.folgaPorId.get("C")).toBe(0);
    // Folga de B = duração do caminho crítico até C (5) − duração de B (2) = 3.
    expect(r.folgaPorId.get("B")).toBe(3);
  });

  it("ignora predecessoras inexistentes sem quebrar", () => {
    const r = calcularCaminhoCritico([tarefa("A", "2026-01-01", 2, ["FANTASMA"])]);
    expect(r.criticas.has("A")).toBe(true);
  });

  it("é defensivo contra ciclo (não trava)", () => {
    // A depende de B e B depende de A — não deve entrar em loop infinito.
    const tarefas: TarefaCPM[] = [
      { id: "A", inicioPrevisto: "2026-01-01", fimPrevisto: "2026-01-02", predecessoraIds: ["B"] },
      { id: "B", inicioPrevisto: "2026-01-01", fimPrevisto: "2026-01-02", predecessoraIds: ["A"] },
    ];
    const r = calcularCaminhoCritico(tarefas);
    expect(r.folgaPorId.size).toBe(2);
  });
});
