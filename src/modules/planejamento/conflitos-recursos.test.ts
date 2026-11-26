import { describe, expect, it } from "vitest";
import {
  conflitosDoProjeto,
  conflitosPorLinha,
  segundaDaSemanaIso,
  semanasAteOFim,
  trechosDosConflitos,
  type ConflitoRecurso,
} from "./conflitos-recursos";
import { chaveSemanaIso } from "./disponibilidade";
import type { ParcelaDia, SobrecargaDia } from "./recursos";

const parcela = (over: Partial<ParcelaDia>): ParcelaDia => ({
  userId: "joao",
  dia: "2026-11-26",
  projetoId: "este",
  linhaId: "e1",
  atribuicaoId: "a",
  horas: 4,
  rascunho: false,
  ...over,
});

const sobrecarga = (over: Partial<SobrecargaDia> = {}): SobrecargaDia => ({
  userId: "joao",
  dia: "2026-11-26",
  carga: 14,
  capacidade: 8,
  excesso: 6,
  parcelas: [
    parcela({ projetoId: "outro", linhaId: "o1", atribuicaoId: "a1", horas: 8 }),
    parcela({ linhaId: "e1", atribuicaoId: "a2", horas: 4 }),
    parcela({ linhaId: "e2", atribuicaoId: "a3", horas: 2 }),
  ],
  motivosReducao: [],
  ...over,
});

const contexto = {
  nomes: new Map([["joao", "João Vitor"]]),
  linhas: { e1: { nome: "Modelagem" }, e2: { nome: "Detalhamento" }, o1: { nome: "Revisão" } },
  projetos: { outro: "P-002 — Residencial Y", este: "P-001 — Edifício X", w: "P-003 — W" },
  verCargaDaEquipe: true,
};

describe("conflitosDoProjeto (por dia)", () => {
  it("fica só com o dia em que ESTE projeto põe hora", () => {
    const so = sobrecarga({ userId: "maria", parcelas: [parcela({ userId: "maria", projetoId: "outro", linhaId: "o1", horas: 10 })] });
    expect(conflitosDoProjeto([so], "este", contexto)).toEqual([]);
  });

  it("separa as horas deste projeto das dos outros e lista as linhas daqui", () => {
    const [c] = conflitosDoProjeto([sobrecarga()], "este", contexto);
    expect(c.nome).toBe("João Vitor");
    expect(c.dia).toBe("2026-11-26");
    expect(c.horasDoProjeto).toBe(6);
    expect(c.horasOutros).toBe(8);
    expect(c.outros).toEqual([{ projetoId: "outro", rotulo: "P-002 — Residencial Y", horas: 8, rascunho: false }]);
    expect(c.linhas).toEqual([
      { id: "e1", nome: "Modelagem" },
      { id: "e2", nome: "Detalhamento" },
    ]);
  });

  it("marca o outro projeto em rascunho ('com W, em rascunho')", () => {
    const so = sobrecarga({ parcelas: [parcela({ horas: 8 }), parcela({ projetoId: "w", linhaId: "w1", horas: 6, rascunho: true })] });
    expect(conflitosDoProjeto([so], "este", contexto)[0].outros).toEqual([{ projetoId: "w", rotulo: "P-003 — W", horas: 6, rascunho: true }]);
  });

  it("sem recursos:ver, não diz quais são os outros projetos nem o motivo do dia menor (só as horas)", () => {
    const [c] = conflitosDoProjeto([sobrecarga({ motivosReducao: ["férias"] })], "este", { ...contexto, verCargaDaEquipe: false });
    expect(c.outros).toBeNull();
    expect(c.motivosReducao).toEqual([]);
    expect(c.horasOutros).toBe(8);
    const [comVer] = conflitosDoProjeto([sobrecarga({ motivosReducao: ["férias"] })], "este", contexto);
    expect(comVer.motivosReducao).toEqual(["férias"]);
  });

  it("parcela de zero hora não faz o projeto entrar no conflito", () => {
    const so = sobrecarga({ parcelas: [parcela({ projetoId: "outro", linhaId: "o1", horas: 10 }), parcela({ horas: 0 })] });
    expect(conflitosDoProjeto([so], "este", contexto)).toEqual([]);
  });

  it("ordena por dia e depois por nome", () => {
    const a = sobrecarga({ dia: "2026-11-27" });
    const b = sobrecarga({ userId: "ana", dia: "2026-11-26", parcelas: [parcela({ userId: "ana", horas: 10 })] });
    const c = sobrecarga({ dia: "2026-11-26" });
    const nomes = new Map([...contexto.nomes, ["ana", "Ana"]]);
    expect(conflitosDoProjeto([a, b, c], "este", { ...contexto, nomes }).map((x) => `${x.dia} ${x.nome}`)).toEqual([
      "2026-11-26 Ana",
      "2026-11-26 João Vitor",
      "2026-11-27 João Vitor",
    ]);
  });
});

const conflito = (over: Partial<ConflitoRecurso>): ConflitoRecurso => ({
  userId: "mireli",
  nome: "Mireli",
  dia: "2026-11-26",
  carga: 14,
  capacidade: 8,
  excesso: 6,
  horasDoProjeto: 6,
  horasOutros: 8,
  outros: [{ projetoId: "y", rotulo: "Y", horas: 8, rascunho: false }],
  linhas: [{ id: "e1", nome: "Modelagem" }],
  motivosReducao: [],
  ...over,
});

describe("trechosDosConflitos", () => {
  it("dias seguidos com os mesmos outros projetos viram um trecho; o fim de semana não quebra", () => {
    const t = trechosDosConflitos([conflito({ dia: "2026-11-26" }), conflito({ dia: "2026-11-27", carga: 16 }), conflito({ dia: "2026-11-30" })]);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ de: "2026-11-26", ate: "2026-11-30", dias: 3, cargaMaxima: 16, horasDoProjeto: 18, horasOutros: 24 });
    expect(t[0].outros).toEqual([{ projetoId: "y", rotulo: "Y", horas: 24, rascunho: false }]);
  });

  it("outro projeto diferente ou um buraco de mais de 3 dias abre outro trecho", () => {
    const t = trechosDosConflitos([
      conflito({ dia: "2026-11-23" }),
      conflito({ dia: "2026-11-24", outros: [{ projetoId: "w", rotulo: "W", horas: 8, rascunho: true }] }),
      conflito({ dia: "2026-12-01", outros: [{ projetoId: "w", rotulo: "W", horas: 8, rascunho: true }] }),
    ]);
    expect(t.map((x) => `${x.de}..${x.ate}`)).toEqual(["2026-11-23..2026-11-23", "2026-11-24..2026-11-24", "2026-12-01..2026-12-01"]);
  });

  it("junta as linhas e os motivos do trecho, sem repetir", () => {
    const [t] = trechosDosConflitos([
      conflito({ dia: "2026-11-26", motivosReducao: ["feriado (X)"] }),
      conflito({ dia: "2026-11-27", linhas: [{ id: "e1", nome: "Modelagem" }, { id: "e2", nome: "Detalhamento" }], motivosReducao: ["feriado (X)"] }),
    ]);
    expect(t.linhas.map((l) => l.id)).toEqual(["e1", "e2"]);
    expect(t.motivosReducao).toEqual(["feriado (X)"]);
  });
});

describe("conflitosPorLinha", () => {
  it("linha → pessoa → dias, para pôr o nome em vermelho na coluna Recursos", () => {
    const m = conflitosPorLinha([
      conflito({ dia: "2026-11-27" }),
      conflito({ dia: "2026-11-26" }),
      conflito({ userId: "joao", nome: "João", dia: "2026-11-26", linhas: [{ id: "e2", nome: "D" }] }),
    ]);
    expect(m.get("e1")?.get("mireli")).toEqual(["2026-11-26", "2026-11-27"]);
    expect(m.get("e2")?.get("joao")).toEqual(["2026-11-26"]);
    expect(m.get("e1")?.has("joao")).toBe(false);
  });
});

describe("segundaDaSemanaIso", () => {
  it("devolve a segunda-feira da semana ISO", () => {
    expect(segundaDaSemanaIso("2026-W48")).toBe("2026-11-23");
    expect(segundaDaSemanaIso("2027-W01")).toBe("2027-01-04");
  });

  it("é o inverso de chaveSemanaIso", () => {
    for (const dia of ["2026-01-01", "2026-06-15", "2026-12-31", "2027-01-03"]) {
      const s = chaveSemanaIso(dia);
      expect(chaveSemanaIso(segundaDaSemanaIso(s))).toBe(s);
    }
  });
});

describe("semanasAteOFim", () => {
  it("projeto já terminado ou sem fim não tem janela", () => {
    expect(semanasAteOFim("2026-11-24", null)).toBe(0);
    expect(semanasAteOFim("2026-11-24", "2026-11-01")).toBe(0);
  });
  it("cobre a semana de hoje até a do fim", () => {
    expect(semanasAteOFim("2026-11-24", "2026-11-24")).toBe(2);
    expect(semanasAteOFim("2026-11-24", "2026-12-24")).toBe(6);
  });
  it("limita a um ano", () => {
    expect(semanasAteOFim("2026-11-24", "2030-01-01")).toBe(52);
  });
});
