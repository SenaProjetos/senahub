import { describe, expect, it } from "vitest";
import type { StatusDisciplina } from "@/generated/prisma/enums";
import { entregueEmAposRecalculo, statusDaDisciplinaPelasFases as calc, statusVemDasFases } from "./status-pelas-fases";

const TODOS: StatusDisciplina[] = ["aguardando", "em_andamento", "em_revisao", "entregue", "aprovado"];

describe("statusDaDisciplinaPelasFases", () => {
  it("1. sem fase devolve o status atual, qualquer que seja", () => {
    for (const s of TODOS) expect(calc([], s)).toBe(s);
  });

  it("2. alguma fase em revisão manda, mesmo com a disciplina aprovada", () => {
    expect(calc(["aprovado", "aprovado", "em_revisao"], "aprovado")).toBe("em_revisao");
    expect(calc(["aguardando", "em_revisao"], "aguardando")).toBe("em_revisao");
  });

  it("3. todas aprovadas = aprovado", () => {
    expect(calc(["aprovado", "aprovado"], "entregue")).toBe("aprovado");
    expect(calc(["aprovado"], "em_revisao")).toBe("aprovado");
  });

  it("4. disciplina aprovada não sai de aprovado sem revisão (paga inteira antes das fases, fase nova)", () => {
    expect(calc(["aguardando", "aguardando"], "aprovado")).toBe("aprovado");
    expect(calc(["aprovado", "aguardando"], "aprovado")).toBe("aprovado");
    expect(calc(["entregue"], "aprovado")).toBe("aprovado");
  });

  it("5. todas entregues ou aprovadas = entregue", () => {
    expect(calc(["entregue", "entregue", "entregue"], "em_andamento")).toBe("entregue");
    expect(calc(["aprovado", "entregue"], "em_andamento")).toBe("entregue");
    // A única fase enviada salta de aguardando para entregue (fora da máquina manual).
    expect(calc(["entregue"], "aguardando")).toBe("entregue");
  });

  it("6. alguma fase andando, sem fechar, = em andamento", () => {
    expect(calc(["aprovado", "aguardando", "aguardando"], "aguardando")).toBe("em_andamento");
    expect(calc(["entregue", "entregue", "aguardando"], "entregue")).toBe("em_andamento");
    expect(calc(["em_andamento", "aguardando"], "aguardando")).toBe("em_andamento");
  });

  it("7. todas aguardando = aguardando (o card do PPCI: disciplina 'Em revisão' com a EX aguardando)", () => {
    expect(calc(["aguardando"], "em_revisao")).toBe("aguardando");
    expect(calc(["aguardando", "aguardando"], "em_andamento")).toBe("aguardando");
  });
});

describe("statusVemDasFases", () => {
  it("só com fase e fora do fluxo de pastas", () => {
    expect(statusVemDasFases({ qtdFases: 0, usaPastas: false })).toBe(false);
    expect(statusVemDasFases({ qtdFases: 2, usaPastas: false })).toBe(true);
    expect(statusVemDasFases({ qtdFases: 2, usaPastas: true })).toBe(false);
  });
});

describe("entregueEmAposRecalculo", () => {
  const agora = new Date("2026-11-13T12:00:00Z");
  const antes = new Date("2026-11-01T12:00:00Z");

  it("status igual não mexe", () => {
    expect(entregueEmAposRecalculo("entregue", { status: "entregue", entregueEm: antes }, agora)).toBeUndefined();
  });
  it("entregue guarda a 1ª data", () => {
    expect(entregueEmAposRecalculo("entregue", { status: "em_andamento", entregueEm: null }, agora)).toBe(agora);
    expect(entregueEmAposRecalculo("entregue", { status: "em_revisao", entregueEm: antes }, agora)).toBe(antes);
  });
  it("aprovado grava a data da aprovação", () => {
    expect(entregueEmAposRecalculo("aprovado", { status: "entregue", entregueEm: antes }, agora)).toBe(agora);
  });
  it("revisão mantém a data", () => {
    expect(entregueEmAposRecalculo("em_revisao", { status: "aprovado", entregueEm: antes }, agora)).toBe(antes);
  });
  it("voltar para antes da entrega limpa; já limpo não mexe", () => {
    expect(entregueEmAposRecalculo("em_andamento", { status: "entregue", entregueEm: antes }, agora)).toBeNull();
    expect(entregueEmAposRecalculo("aguardando", { status: "em_andamento", entregueEm: null }, agora)).toBeUndefined();
  });
});
