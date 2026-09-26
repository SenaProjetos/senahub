import { describe, expect, it } from "vitest";
import { valorSugeridoPorDisciplina } from "./valor-entrega";

const disc = (id: string, nome: string, disciplinaId: string | null = null) => ({ id, nome, disciplinaId });
const item = (disciplinaTextoLegado: string, valor: number, disciplinaId: string | null = null) => ({
  disciplinaId,
  disciplinaTextoLegado,
  valor,
});

describe("valorSugeridoPorDisciplina", () => {
  it("casa pelo catálogo, mesmo com o nome escrito diferente", () => {
    const r = valorSugeridoPorDisciplina([disc("d1", "Elétrica", "cat-ele")], [item("Projeto elétrico", 8000, "cat-ele")]);
    expect(r.get("d1")).toBe(8000);
  });

  it("sem catálogo em um dos lados, casa pelo nome sem acento e sem caixa", () => {
    const r = valorSugeridoPorDisciplina([disc("d1", "ELÉTRICA")], [item("eletrica", 1234.56)]);
    expect(r.get("d1")).toBe(1234.56);
  });

  it("dois itens da mesma disciplina somam, em centavos", () => {
    const r = valorSugeridoPorDisciplina([disc("d1", "Estrutural", "cat-est")], [item("Estrutural", 0.1, "cat-est"), item("Estrutural", 0.2, "cat-est")]);
    expect(r.get("d1")).toBe(0.3);
  });

  it("sem item da proposta, sem sugestão — nunca cai em outro valor", () => {
    const r = valorSugeridoPorDisciplina([disc("d1", "Hidráulica", "cat-hid")], [item("Elétrica", 5000, "cat-ele")]);
    expect(r.get("d1")).toBeNull();
  });

  it("catálogo diferente não casa só por o nome parecer", () => {
    const r = valorSugeridoPorDisciplina([disc("d1", "Elétrica", "cat-ele")], [item("Elétrica", 5000, "cat-outra")]);
    expect(r.get("d1")).toBeNull();
  });

  it("item de valor zero não vira sugestão", () => {
    const r = valorSugeridoPorDisciplina([disc("d1", "Elétrica")], [item("Elétrica", 0)]);
    expect(r.get("d1")).toBeNull();
  });

  it("uma sugestão por disciplina do projeto, inclusive as sem item", () => {
    const r = valorSugeridoPorDisciplina([disc("d1", "A"), disc("d2", "B")], [item("A", 10)]);
    expect([...r.entries()]).toEqual([["d1", 10], ["d2", null]]);
  });
});
