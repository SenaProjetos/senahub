import { describe, expect, it } from "vitest";
import { FILTRO_SEM_DISCIPLINA, SEM_DISCIPLINA, calcularResultados, pessoasDoResultado, type DadosResultados } from "./resultados";

const base: DadosResultados = {
  disciplinas: [
    { id: "est", nome: "Estrutural" },
    { id: "ele", nome: "Elétrica" },
  ],
  pessoas: [
    { id: "ana", nome: "Ana" },
    { id: "bia", nome: "Bia" },
    { id: "caio", nome: "Caio" },
  ],
  linhas: [
    { id: "g", codigo: "1", nome: "Estrutural", disciplinaId: "est", ehResumo: true, ordem: 0 },
    { id: "m", codigo: "1.2", nome: "Modelagem", disciplinaId: "est", ehResumo: false, ordem: 2 },
    { id: "a", codigo: "1.10", nome: "Detalhamento", disciplinaId: "est", ehResumo: false, ordem: 3 },
    { id: "e", codigo: "2.1", nome: "Pontos", disciplinaId: "ele", ehResumo: false, ordem: 5 },
    { id: "x", codigo: "3", nome: "Reunião geral", disciplinaId: null, ehResumo: false, ordem: 6 },
  ],
  previstas: [
    { linhaId: "g", userId: "ana", horas: 99 }, // agrupamento: não conta
    { linhaId: "m", userId: "ana", horas: 10 },
    { linhaId: "m", userId: null, horas: 6 }, // perfil (vaga)
    { linhaId: "a", userId: "bia", horas: 8 },
    { linhaId: "e", userId: "bia", horas: 4 },
  ],
  apontados: [
    { linhaId: "m", disciplinaId: "est", userId: "ana", minutos: 12 * 60 },
    { linhaId: "a", disciplinaId: "est", userId: "bia", minutos: 90 },
    { linhaId: null, disciplinaId: "est", userId: "caio", minutos: 120 }, // sem tarefa do cronograma
    { linhaId: null, disciplinaId: null, userId: "ana", minutos: 30 },
  ],
};

describe("calcularResultados", () => {
  const r = calcularResultados(base);
  const est = r.disciplinas.find((d) => d.disciplinaId === "est")!;

  it("previsto só das atividades (agrupamento fora) e apontado com o que não tem tarefa", () => {
    expect(est.previstoH).toBe(24);
    expect(est.apontadoH).toBe(15.5); // 12 + 1,5 + 2 sem tarefa
    expect(est.semTarefaH).toBe(2);
    expect(est.saldoH).toBe(8.5);
    expect(est.consumido).toBe(65);
  });

  it("tarefas na ordem do código da EAP (1.2 antes de 1.10), com o saldo de cada uma", () => {
    expect(est.tarefas.map((t) => t.codigo)).toEqual(["1.2", "1.10"]);
    expect(est.tarefas[0]).toMatchObject({ previstoH: 16, apontadoH: 12, saldoH: 4, consumido: 75 });
  });

  it("disciplinas na ordem do projeto, 'Sem disciplina' por último; total soma tudo", () => {
    expect(r.disciplinas.map((d) => d.nome)).toEqual(["Estrutural", "Elétrica", SEM_DISCIPLINA]);
    expect(r.total.previstoH).toBe(28);
    expect(r.total.apontadoH).toBe(16);
  });

  it("linha só prevista ou só apontada aparece; sem nenhuma hora, não", () => {
    expect(r.disciplinas.find((d) => d.disciplinaId === "ele")!.tarefas).toHaveLength(1);
    expect(r.disciplinas.flatMap((d) => d.tarefas).some((t) => t.id === "x")).toBe(false);
  });

  it("sem previsto, o % consumido é nulo (não há contra o que medir) e o saldo fica negativo", () => {
    const sem = r.disciplinas.find((d) => d.disciplinaId === null)!;
    expect(sem.consumido).toBeNull();
    expect(sem.saldoH).toBe(-0.5);
  });

  it("filtro por pessoa recorta o previsto e o apontado", () => {
    const soAna = calcularResultados(base, { userId: "ana" });
    const e = soAna.disciplinas.find((d) => d.disciplinaId === "est")!;
    expect(e.previstoH).toBe(10); // a vaga (perfil) não é de ninguém
    expect(e.apontadoH).toBe(12);
    expect(soAna.disciplinas.some((d) => d.disciplinaId === "ele")).toBe(false);
  });

  it("filtro por disciplina deixa só ela, inclusive a 'Sem disciplina'", () => {
    expect(calcularResultados(base, { disciplinaId: "ele" }).disciplinas.map((d) => d.disciplinaId)).toEqual(["ele"]);
    const sem = calcularResultados(base, { disciplinaId: FILTRO_SEM_DISCIPLINA });
    expect(sem.disciplinas.map((d) => d.disciplinaId)).toEqual([null]);
    expect(sem.total.apontadoH).toBe(0.5);
  });

  it("sem custo/hora (quem não vê o financeiro), nada de R$", () => {
    expect(r.total.custoPrevisto).toBeNull();
    expect(est.tarefas[0].custoApontado).toBeNull();
  });

  it("com custo/hora: desconhecido nunca vira zero — fica contado à parte", () => {
    const c = calcularResultados({ ...base, custoHora: { ana: 100, bia: 50 } });
    const m = c.disciplinas[0].tarefas[0];
    expect(m.custoPrevisto).toEqual({ valor: 1000, horasSemCusto: 6 }); // 10h × 100; a vaga de 6h fica fora
    expect(m.custoApontado).toEqual({ valor: 1200, horasSemCusto: 0 });
    const est2 = c.disciplinas[0];
    expect(est2.custoApontado).toEqual({ valor: 1200 + 75, horasSemCusto: 2 }); // Caio sem taxa
  });
});

describe("pessoasDoResultado", () => {
  it("só quem tem hora prevista ou apontada, em ordem alfabética", () => {
    expect(pessoasDoResultado({ ...base, pessoas: [...base.pessoas, { id: "zé", nome: "Zé" }] }).map((p) => p.nome)).toEqual(["Ana", "Bia", "Caio"]);
  });
});
