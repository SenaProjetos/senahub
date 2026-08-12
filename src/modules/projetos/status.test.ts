import { describe, it, expect } from "vitest";
import {
  progressoProjeto,
  progressoDoStatus,
  PESO_STATUS,
  transicaoDisciplinaPermitida,
  TRANSICOES_DISCIPLINA,
  mensagemTransicaoDisciplina,
  etapaDisciplina,
  rotuloEtapaDisciplina,
  ETAPAS_DISCIPLINA,
} from "./status";
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

describe("transicaoDisciplinaPermitida — máquina de estados (decisão 2026-07-24)", () => {
  // aguardando → em_andamento → entregue ⇄ em_revisao → aprovado
  const permitidas: [StatusDisciplina, StatusDisciplina][] = [
    ["aguardando", "em_andamento"],
    ["em_andamento", "entregue"],
    ["entregue", "em_revisao"],
    ["entregue", "aprovado"],
    ["em_revisao", "entregue"],
    ["em_revisao", "aprovado"],
  ];
  for (const [de, para] of permitidas) {
    it(`permite ${de} → ${para}`, () => {
      expect(transicaoDisciplinaPermitida(de, para)).toBe(true);
    });
  }

  const proibidas: [StatusDisciplina, StatusDisciplina][] = [
    ["aguardando", "entregue"],
    ["aguardando", "aprovado"],
    ["aguardando", "em_revisao"],
    ["em_andamento", "em_revisao"], // revisão só depois de entregue
    ["em_andamento", "aprovado"],
    ["em_andamento", "aguardando"], // sem voltar
    ["entregue", "em_andamento"],
    ["em_revisao", "em_andamento"],
    ["aprovado", "em_andamento"], // terminal
    ["aprovado", "em_revisao"],
    ["aprovado", "entregue"],
  ];
  for (const [de, para] of proibidas) {
    it(`proíbe ${de} → ${para}`, () => {
      expect(transicaoDisciplinaPermitida(de, para)).toBe(false);
    });
  }

  it("manter o mesmo status é no-op permitido", () => {
    const todos = Object.keys(TRANSICOES_DISCIPLINA) as StatusDisciplina[];
    for (const s of todos) expect(transicaoDisciplinaPermitida(s, s)).toBe(true);
  });

  it("aprovado é terminal (sem saídas)", () => {
    expect(TRANSICOES_DISCIPLINA["aprovado"]).toHaveLength(0);
  });

  it("mensagem de erro cita os dois rótulos", () => {
    expect(mensagemTransicaoDisciplina("aguardando", "aprovado")).toContain("Aguardando");
    expect(mensagemTransicaoDisciplina("aguardando", "aprovado")).toContain("Aprovado");
  });
});

describe("etapaDisciplina — trilho do card", () => {
  it("entregue e em_revisao ocupam a MESMA etapa (a máquina vai e volta entre eles)", () => {
    expect(etapaDisciplina("entregue")).toBe(etapaDisciplina("em_revisao"));
  });

  it("as etapas avançam na ordem do fluxo", () => {
    expect(etapaDisciplina("aguardando")).toBe(0);
    expect(etapaDisciplina("em_andamento")).toBe(1);
    expect(etapaDisciplina("entregue")).toBe(2);
    expect(etapaDisciplina("aprovado")).toBe(ETAPAS_DISCIPLINA.length - 1);
  });

  it("todo status cai dentro do trilho", () => {
    const todos: StatusDisciplina[] = ["aguardando", "em_andamento", "em_revisao", "entregue", "aprovado"];
    for (const s of todos) {
      const i = etapaDisciplina(s);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(ETAPAS_DISCIPLINA.length);
    }
  });
});

describe("rotuloEtapaDisciplina", () => {
  it("etapas fixas ignoram o status atual", () => {
    expect(rotuloEtapaDisciplina(0, "aprovado", null)).toBe("Aguardando");
    expect(rotuloEtapaDisciplina(1, "aprovado", null)).toBe("Em andamento");
    expect(rotuloEtapaDisciplina(3, "aguardando", null)).toBe("Aprovado");
  });

  it("a 3ª etapa mostra o estado real", () => {
    expect(rotuloEtapaDisciplina(2, "entregue", null)).toBe("Entregue");
    expect(rotuloEtapaDisciplina(2, "em_revisao", null)).toBe("Em revisão");
    expect(rotuloEtapaDisciplina(2, "entregue", new Date())).toBe("Aguardando confirmação");
  });

  it("solicitação em aberto só muda o rótulo em 'entregue' (mesma regra de rotuloStatusDisciplina)", () => {
    expect(rotuloEtapaDisciplina(2, "em_revisao", new Date())).toBe("Em revisão");
  });
});
