import { describe, expect, it } from "vitest";
import { conflitosDoProjeto, segundaDaSemanaIso, semanasAteOFim } from "./conflitos-recursos";
import { chaveSemanaIso } from "./disponibilidade";
import type { Sobrecarga } from "./recursos";

const sobrecarga = (over: Partial<Sobrecarga> = {}): Sobrecarga => ({
  userId: "joao",
  semana: "2026-W51",
  carga: 56,
  capacidade: 40,
  excesso: 16,
  parcelas: [
    { userId: "joao", semana: "2026-W51", projetoId: "outro", linhaId: "o1", atribuicaoId: "a1", horas: 32 },
    { userId: "joao", semana: "2026-W51", projetoId: "este", linhaId: "e1", atribuicaoId: "a2", horas: 16 },
    { userId: "joao", semana: "2026-W51", projetoId: "este", linhaId: "e2", atribuicaoId: "a3", horas: 8 },
  ],
  motivosReducao: [],
  ...over,
});

const contexto = {
  nomes: new Map([["joao", "João Vitor"]]),
  linhas: { e1: { nome: "Modelagem" }, e2: { nome: "Detalhamento" }, o1: { nome: "Revisão" } },
  projetos: { outro: "P-002 — Residencial Y", este: "P-001 — Edifício X" },
  verCargaDaEquipe: true,
};

describe("conflitosDoProjeto", () => {
  it("fica só com a sobrecarga em que ESTE projeto põe hora", () => {
    const so = sobrecarga({
      userId: "maria",
      parcelas: [{ userId: "maria", semana: "2026-W51", projetoId: "outro", linhaId: "o1", atribuicaoId: "x", horas: 50 }],
    });
    expect(conflitosDoProjeto([so], "este", contexto)).toEqual([]);
  });

  it("separa as horas deste projeto das dos outros e lista as linhas daqui", () => {
    const [c] = conflitosDoProjeto([sobrecarga()], "este", contexto);
    expect(c.nome).toBe("João Vitor");
    expect(c.horasDoProjeto).toBe(24);
    expect(c.horasOutros).toBe(32);
    expect(c.outros).toEqual([{ projetoId: "outro", rotulo: "P-002 — Residencial Y", horas: 32 }]);
    expect(c.linhas).toEqual([
      { id: "e1", nome: "Modelagem" },
      { id: "e2", nome: "Detalhamento" },
    ]);
    expect(c.inicioSemana).toBe("2026-12-14");
  });

  it("sem recursos:ver, não diz quais são os outros projetos nem o motivo da semana menor (só as horas)", () => {
    const [c] = conflitosDoProjeto([sobrecarga({ motivosReducao: ["férias"] })], "este", { ...contexto, verCargaDaEquipe: false });
    expect(c.outros).toBeNull();
    expect(c.motivosReducao).toEqual([]);
    expect(c.horasOutros).toBe(32);
    const [comVer] = conflitosDoProjeto([sobrecarga({ motivosReducao: ["férias"] })], "este", contexto);
    expect(comVer.motivosReducao).toEqual(["férias"]);
  });

  it("parcela de zero hora não faz o projeto entrar no conflito", () => {
    const so = sobrecarga({
      parcelas: [
        { userId: "joao", semana: "2026-W51", projetoId: "outro", linhaId: "o1", atribuicaoId: "a1", horas: 50 },
        { userId: "joao", semana: "2026-W51", projetoId: "este", linhaId: "e1", atribuicaoId: "a2", horas: 0 },
      ],
    });
    expect(conflitosDoProjeto([so], "este", contexto)).toEqual([]);
  });

  it("ordena por semana e depois por nome", () => {
    const r = conflitosDoProjeto(
      [
        sobrecarga({ semana: "2026-W52" }),
        sobrecarga({ userId: "ana", semana: "2026-W51" }),
        sobrecarga({ semana: "2026-W51" }),
      ],
      "este",
      { ...contexto, nomes: new Map([["joao", "João Vitor"], ["ana", "Ana"]]) },
    );
    expect(r.map((c) => `${c.semana} ${c.nome}`)).toEqual(["2026-W51 Ana", "2026-W51 João Vitor", "2026-W52 João Vitor"]);
  });
});

describe("segundaDaSemanaIso", () => {
  it.each(["2026-01-01", "2026-11-24", "2026-12-31", "2027-01-04", "2027-01-03", "2020-12-31"])("volta à segunda da semana de %s", (dia) => {
    const segunda = segundaDaSemanaIso(chaveSemanaIso(dia));
    expect(new Date(`${segunda}T00:00:00Z`).getUTCDay()).toBe(1);
    expect(chaveSemanaIso(segunda)).toBe(chaveSemanaIso(dia));
    expect(segunda <= dia).toBe(true);
  });
});

describe("semanasAteOFim", () => {
  it("projeto já terminado ou sem fim não tem janela", () => {
    expect(semanasAteOFim("2026-11-24", "2026-11-20")).toBe(0);
    expect(semanasAteOFim("2026-11-24", null)).toBe(0);
  });
  it("cobre a semana de hoje até a do fim", () => {
    expect(semanasAteOFim("2026-11-24", "2026-11-24")).toBe(2);
    expect(semanasAteOFim("2026-11-24", "2026-12-31")).toBeGreaterThanOrEqual(7);
  });
  it("limita a um ano", () => {
    expect(semanasAteOFim("2026-11-24", "2030-01-01")).toBe(52);
  });
});
