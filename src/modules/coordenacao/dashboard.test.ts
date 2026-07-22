import { describe, expect, it } from "vitest";
import {
  contarPorStatus,
  contarPorDisciplina,
  semanasCriadosEncerrados,
  type ApontamentoResumo,
} from "@/modules/coordenacao/dashboard";

function ap(over: Partial<ApontamentoResumo>): ApontamentoResumo {
  return {
    createdAt: "2026-07-01T10:00:00.000Z",
    resolvidoEm: null,
    fechadoEm: null,
    status: "aberta",
    disciplinaNome: "Estrutural",
    ...over,
  };
}

describe("contarPorStatus", () => {
  it("retorna os 4 status na ordem canônica, mesmo com contagem 0", () => {
    const r = contarPorStatus([ap({ status: "aberta" })]);
    expect(r).toEqual([
      { status: "aberta", total: 1 },
      { status: "resolvida", total: 0 },
      { status: "fechada", total: 0 },
      { status: "descartada", total: 0 },
    ]);
  });

  it("conta múltiplos apontamentos por status", () => {
    const r = contarPorStatus([
      ap({ status: "aberta" }),
      ap({ status: "aberta" }),
      ap({ status: "fechada" }),
    ]);
    expect(r.find((s) => s.status === "aberta")?.total).toBe(2);
    expect(r.find((s) => s.status === "fechada")?.total).toBe(1);
  });
});

describe("contarPorDisciplina", () => {
  it("agrupa por disciplina com total e abertos, ordenado desc por total", () => {
    const r = contarPorDisciplina([
      ap({ disciplinaNome: "Estrutural", status: "aberta" }),
      ap({ disciplinaNome: "Estrutural", status: "fechada" }),
      ap({ disciplinaNome: "Hidráulica", status: "aberta" }),
    ]);
    expect(r).toEqual([
      { disciplina: "Estrutural", total: 2, abertos: 1 },
      { disciplina: "Hidráulica", total: 1, abertos: 1 },
    ]);
  });

  it("lista vazia retorna vazio", () => {
    expect(contarPorDisciplina([])).toEqual([]);
  });
});

describe("semanasCriadosEncerrados", () => {
  const referencia = new Date("2026-07-21T12:00:00.000Z"); // terça-feira

  it("retorna o número de semanas pedido, mais recente por último", () => {
    const r = semanasCriadosEncerrados([], 4, referencia);
    expect(r).toHaveLength(4);
  });

  it("conta criado na semana correta", () => {
    const r = semanasCriadosEncerrados(
      [ap({ createdAt: "2026-07-21T09:00:00.000Z" })], // mesma semana da referência
      2,
      referencia,
    );
    expect(r[r.length - 1].criados).toBe(1);
    expect(r[0].criados).toBe(0);
  });

  it("conta encerrado (resolvidoEm) na semana correta, separado de criados", () => {
    const r = semanasCriadosEncerrados(
      [
        ap({
          createdAt: "2026-07-15T09:00:00.000Z", // semana anterior (segunda 07-13 a domingo 07-19)
          resolvidoEm: "2026-07-21T09:00:00.000Z", // semana atual
          status: "resolvida",
        }),
      ],
      2,
      referencia,
    );
    expect(r[0].criados).toBe(1); // semana anterior
    expect(r[1].encerrados).toBe(1); // semana atual
    expect(r[0].encerrados).toBe(0);
    expect(r[1].criados).toBe(0);
  });

  it("usa fechadoEm quando resolvidoEm é null", () => {
    const r = semanasCriadosEncerrados(
      [ap({ resolvidoEm: null, fechadoEm: "2026-07-21T09:00:00.000Z", status: "fechada" })],
      1,
      referencia,
    );
    expect(r[0].encerrados).toBe(1);
  });

  it("apontamento fora da janela de semanas não é contado", () => {
    const r = semanasCriadosEncerrados(
      [ap({ createdAt: "2020-01-01T00:00:00.000Z" })],
      2,
      referencia,
    );
    expect(r.reduce((acc, p) => acc + p.criados, 0)).toBe(0);
  });
});
