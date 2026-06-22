import { describe, it, expect } from "vitest";
import { progressoProjeto, progressoDoStatus, PESO_STATUS } from "./status";
import type { StatusDisciplina } from "@/generated/prisma/client";

describe("progressoProjeto", () => {
  it("sem disciplinas = 0%", () => {
    expect(progressoProjeto([])).toBe(0);
  });
  it("todas aguardando = 0%", () => {
    expect(progressoProjeto(["aguardando", "aguardando"])).toBe(0);
  });
  it("todas aprovadas = 100%", () => {
    expect(progressoProjeto(["aprovado", "aprovado", "aprovado"])).toBe(100);
  });
  it("metade aprovada + metade aguardando = 50%", () => {
    expect(progressoProjeto(["aprovado", "aguardando"])).toBe(50);
  });
  it("disciplina única em_andamento = 40%", () => {
    expect(progressoProjeto(["em_andamento"])).toBe(40);
  });
  it("mistura de statuses = média correta", () => {
    // aguardando(0) + em_andamento(0.4) + aprovado(1) = média 0.4667 → 47%
    const r = progressoProjeto(["aguardando", "em_andamento", "aprovado"]);
    expect(r).toBe(47);
  });
  it("arredonda para inteiro", () => {
    // entregue(0.85) + aguardando(0) = 0.425 → 43%
    expect(progressoProjeto(["entregue", "aguardando"])).toBe(43);
  });
});

describe("progressoDoStatus", () => {
  const casos: [StatusDisciplina, number][] = [
    ["aguardando", 0],
    ["em_andamento", 40],
    ["em_revisao", 60],
    ["entregue", 85],
    ["aprovado", 100],
  ];
  for (const [status, esperado] of casos) {
    it(`${status} = ${esperado}%`, () => {
      expect(progressoDoStatus(status)).toBe(esperado);
    });
  }
});

describe("PESO_STATUS", () => {
  it("está ordenado crescentemente (aguardando < em_andamento < ... < aprovado)", () => {
    const ordem: StatusDisciplina[] = ["aguardando", "em_andamento", "em_revisao", "entregue", "aprovado"];
    for (let i = 0; i < ordem.length - 1; i++) {
      expect(PESO_STATUS[ordem[i]]).toBeLessThan(PESO_STATUS[ordem[i + 1]]);
    }
  });
  it("aprovado tem peso 1 (100%)", () => {
    expect(PESO_STATUS["aprovado"]).toBe(1);
  });
});
