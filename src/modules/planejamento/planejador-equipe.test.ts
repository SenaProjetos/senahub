import { describe, expect, it } from "vitest";
import {
  deslocarJanela,
  empilhar,
  janelaDoPlanejador,
  montarPlanejador,
  posicaoNaJanela,
  resumoDoConflitoDaPessoa,
  type LinhaDoPlanejador,
} from "./planejador-equipe";
import type { SobrecargaDia } from "./recursos";

const linha = (over: Partial<LinhaDoPlanejador>): LinhaDoPlanejador => ({
  id: "l",
  projetoId: "X",
  nome: "Modelagem sanitária",
  disciplina: "Hidrossanitário",
  inicio: "2026-11-23",
  fim: "2026-11-26",
  rascunho: false,
  marco: false,
  deTerceiro: false,
  pessoas: [{ userId: "mireli", horas: 24 }],
  ...over,
});

const projetos = { X: { codigo: "X", nome: "Projeto X", cor: "projeto-1" }, Y: { codigo: "Y", nome: "Projeto Y", cor: null }, Z: { codigo: "Z", nome: "Projeto Z", cor: null } };
const pessoas = [
  { userId: "mireli", nome: "Mireli", horasPorDia: 8, disciplinas: ["Elétrica"] },
  { userId: "joao", nome: "João Vitor", horasPorDia: 8, disciplinas: [] },
  { userId: "gicelly", nome: "Gicelly", horasPorDia: 8, disciplinas: [] },
];
const janela = { de: "2026-11-23", ate: "2026-12-13" };

const sobrecarga: SobrecargaDia = {
  userId: "mireli",
  dia: "2026-11-26",
  carga: 14,
  capacidade: 8,
  excesso: 6,
  parcelas: [
    { userId: "mireli", dia: "2026-11-26", projetoId: "Y", linhaId: "y1", atribuicaoId: "a", horas: 8, rascunho: false },
    { userId: "mireli", dia: "2026-11-26", projetoId: "X", linhaId: "x1", atribuicaoId: "b", horas: 6, rascunho: false },
  ],
  motivosReducao: [],
};

describe("montarPlanejador", () => {
  const linhas = [
    linha({ id: "x1" }),
    linha({ id: "y1", projetoId: "Y", nome: "Revisão interna", inicio: "2026-11-26", fim: "2026-11-27", pessoas: [{ userId: "mireli", horas: 16 }] }),
    linha({ id: "z1", projetoId: "Z", nome: "Modelagem elétrica", disciplina: "Elétrica", rascunho: true, pessoas: [{ userId: "joao", horas: 20 }] }),
    linha({ id: "s1", projetoId: "Y", nome: "Documentação", pessoas: [] }),
    linha({ id: "t1", projetoId: "X", nome: "Aprovação prefeitura", pessoas: [], deTerceiro: true }),
    linha({ id: "fora", inicio: "2027-02-01", fim: "2027-02-05" }),
  ];
  const linhasNomes = { x1: { nome: "Modelagem sanitária" }, y1: { nome: "Revisão interna" } };
  const base = { linhas, pessoas, sobrecargas: [sobrecarga], projetos, linhasNomes, janela };

  it("uma faixa por pessoa (todas, em ordem de nome), barras sobrepostas em andares", () => {
    const p = montarPlanejador(base);
    expect(p.faixas.map((f) => f.nome)).toEqual(["Gicelly", "João Vitor", "Mireli"]);
    const mireli = p.faixas.find((f) => f.userId === "mireli")!;
    expect(mireli.niveis).toBe(2);
    expect(mireli.barras.map((b) => [b.linhaId, b.nivel])).toEqual([
      ["x1", 0],
      ["y1", 1],
    ]);
  });

  it("cor do projeto (escolhida ou automática), rascunho marcado, fora da janela e terceiro ficam de fora", () => {
    const p = montarPlanejador(base);
    expect(p.faixas.find((f) => f.userId === "mireli")!.barras[0].cor).toBe("projeto-1");
    expect(p.faixas.find((f) => f.userId === "joao")!.barras[0].rascunho).toBe(true);
    expect(p.projetos.map((x) => x.codigo)).toEqual(["X", "Y", "Z"]);
    const todas = [...p.faixas.flatMap((f) => f.barras), ...p.semNinguem.barras].map((b) => b.linhaId);
    expect(todas).not.toContain("fora");
    expect(todas).not.toContain("t1");
  });

  it("tarefas sem ninguém vão para a faixa do fim", () => {
    expect(montarPlanejador(base).semNinguem.barras.map((b) => b.linhaId)).toEqual(["s1"]);
  });

  it("o dia em conflito vem com as parcelas, os nomes e o total", () => {
    const p = montarPlanejador(base);
    const [c] = p.faixas.find((f) => f.userId === "mireli")!.conflitos;
    expect(c).toMatchObject({ dia: "2026-11-26", carga: 14, capacidade: 8, rascunhos: [] });
    expect(c.parcelas.map((x) => `${x.codigoProjeto} · ${x.linha}: ${x.horas}`)).toEqual(["Y · Revisão interna: 8", "X · Modelagem sanitária: 6"]);
    expect(p.totalConflitos).toBe(1);
  });

  it("filtro de disciplina (sem acento/caixa) e de projeto: só quem tem barra; o sem ninguém também filtra", () => {
    const porDisciplina = montarPlanejador({ ...base, filtros: { disciplina: "eletrica" } });
    expect(porDisciplina.faixas.map((f) => f.userId)).toEqual(["joao"]);
    expect(porDisciplina.semNinguem.barras).toEqual([]);
    const porProjeto = montarPlanejador({ ...base, filtros: { projetoId: "Y" } });
    expect(porProjeto.faixas.map((f) => f.userId)).toEqual(["mireli"]);
    expect(porProjeto.semNinguem.barras.map((b) => b.linhaId)).toEqual(["s1"]);
  });

  it("filtro de pessoa (o link do aviso): só a faixa dela", () => {
    expect(montarPlanejador({ ...base, filtros: { userId: "mireli" } }).faixas.map((f) => f.userId)).toEqual(["mireli"]);
  });
});

describe("empilhar", () => {
  it("encostar no mesmo dia sobe de andar; depois do fim volta para o de baixo", () => {
    const bs = [
      { inicio: "2026-11-23", fim: "2026-11-25", nivel: 0 },
      { inicio: "2026-11-25", fim: "2026-11-26", nivel: 0 },
      { inicio: "2026-11-26", fim: "2026-11-27", nivel: 0 },
    ];
    expect(empilhar(bs)).toBe(2);
    expect(bs.map((b) => b.nivel)).toEqual([0, 1, 0]);
  });
});

describe("janela", () => {
  it("começa na segunda e tem 3 semanas em dias, 12 em semanas", () => {
    expect(janelaDoPlanejador("dias", "2026-11-26")).toEqual({ de: "2026-11-23", ate: "2026-12-13" });
    expect(janelaDoPlanejador("semanas", "2026-11-26")).toEqual({ de: "2026-11-23", ate: "2027-02-14" });
  });

  it("recuar e avançar: 1 semana em dias, 4 em semanas", () => {
    expect(deslocarJanela("dias", "2026-11-23", 1)).toBe("2026-11-30");
    expect(deslocarJanela("semanas", "2026-11-23", -1)).toBe("2026-10-26");
  });

  it("posição da barra cortada nas bordas", () => {
    expect(posicaoNaJanela("2026-11-25", "2026-11-26", janela)).toEqual({ inicio: 2, dias: 2 });
    expect(posicaoNaJanela("2026-11-01", "2026-11-24", janela)).toEqual({ inicio: 0, dias: 2 });
    expect(posicaoNaJanela("2026-12-12", "2026-12-31", janela)).toEqual({ inicio: 19, dias: 2 });
    expect(posicaoNaJanela("2027-01-01", "2027-01-02", janela)).toBeNull();
  });
});

describe("resumoDoConflitoDaPessoa", () => {
  const dc = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7);
  it("um dia, vários dias e com rascunho", () => {
    const c = { dia: "2026-11-26", carga: 14, capacidade: 8, parcelas: [], rascunhos: [] as string[], motivos: [] };
    expect(resumoDoConflitoDaPessoa([], dc)).toBeNull();
    expect(resumoDoConflitoDaPessoa([c], dc)).toBe("Conflito em 26/11");
    expect(resumoDoConflitoDaPessoa([c, { ...c, dia: "2026-11-27", rascunhos: ["Z"] }], dc)).toBe("2 dias de conflito, desde 26/11 · com Z (rascunho)");
  });
});
