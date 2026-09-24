import { describe, expect, it } from "vitest";
import {
  FOLGA_JANELA_DIAS,
  MAX_TAREFAS_NO_PONTO,
  herdarTarefasNaEdicao,
  motivoTarefaInvalida,
  naJanela,
  tarefasDoPeriodo,
  type TarefaCandidata,
} from "./tarefa-ponto";

const t = (id: string, extra: Partial<TarefaCandidata> = {}): TarefaCandidata => ({
  id,
  titulo: `Tarefa ${id}`,
  prazo: null,
  janela: null,
  ...extra,
});

describe("naJanela", () => {
  it("cobre o próprio intervalo e a folga de uma semana em volta", () => {
    const j = { inicio: "2026-10-05", fim: "2026-10-09" };
    expect(naJanela(j, "2026-10-07")).toBe(true);
    expect(naJanela(j, "2026-09-28")).toBe(true); // início − 7
    expect(naJanela(j, "2026-10-16")).toBe(true); // fim + 7
  });

  it("não cobre o que começa só daqui a semanas nem o que acabou faz tempo", () => {
    const j = { inicio: "2026-10-05", fim: "2026-10-09" };
    expect(naJanela(j, "2026-09-27")).toBe(false);
    expect(naJanela(j, "2026-10-17")).toBe(false);
    expect(FOLGA_JANELA_DIAS).toBe(7);
  });
});

describe("tarefasDoPeriodo — a lista curta do ponto (D20)", () => {
  const hoje = "2026-10-07";

  it("card de EAP fora do período some; card manual (sem cronograma) fica", () => {
    const r = tarefasDoPeriodo(
      [
        t("futura", { janela: { inicio: "2026-12-01", fim: "2026-12-10" } }),
        t("velha", { janela: { inicio: "2026-06-01", fim: "2026-06-10" } }),
        t("agora", { janela: { inicio: "2026-10-05", fim: "2026-10-09" } }),
        t("manual"),
      ],
      hoje,
    );
    expect(r.map((x) => x.id).sort()).toEqual(["agora", "manual"]);
  });

  it("o que está na janela exata agora vem primeiro, depois prazo mais próximo, depois título", () => {
    const r = tarefasDoPeriodo(
      [
        t("manual-sem-prazo", { titulo: "Zeta" }),
        t("manual-prazo-longe", { prazo: "2026-12-01" }),
        t("manual-prazo-perto", { prazo: "2026-10-10" }),
        t("agora", { janela: { inicio: "2026-10-05", fim: "2026-10-09" }, prazo: "2026-12-31" }),
        t("folga", { janela: { inicio: "2026-10-12", fim: "2026-10-14" } }),
      ],
      hoje,
    );
    expect(r.map((x) => x.id)).toEqual(["agora", "manual-prazo-perto", "manual-prazo-longe", "folga", "manual-sem-prazo"]);
  });

  it("é CURTA: nunca passa do teto, mesmo com dezenas de cards", () => {
    const muitas = Array.from({ length: 40 }, (_, i) => t(`m${i}`, { titulo: `T${String(i).padStart(2, "0")}` }));
    expect(tarefasDoPeriodo(muitas, hoje)).toHaveLength(MAX_TAREFAS_NO_PONTO);
  });

  it("lista vazia devolve vazia", () => {
    expect(tarefasDoPeriodo([], hoje)).toEqual([]);
  });
});

describe("motivoTarefaInvalida", () => {
  const sessao = { tipoAlocacao: "projeto" as const, projetoId: "p1" };
  const tarefa = { projetoId: "p1", arquivada: false, responsaveisIds: ["maria"] };

  it("vale: da pessoa, do projeto, não arquivada", () => {
    expect(motivoTarefaInvalida(sessao, tarefa, "maria")).toBeNull();
  });

  it("recusa fora de projeto — reunião e sem projeto não têm tarefa", () => {
    for (const tipoAlocacao of ["sem_projeto", "reuniao_interna", "reuniao_externa"] as const) {
      expect(motivoTarefaInvalida({ tipoAlocacao, projetoId: null }, tarefa, "maria")).toMatch(/alocada num projeto/);
    }
  });

  it("recusa tarefa de outro projeto, arquivada, inexistente ou de outra pessoa", () => {
    expect(motivoTarefaInvalida(sessao, { ...tarefa, projetoId: "p2" }, "maria")).toMatch(/não é do projeto/);
    expect(motivoTarefaInvalida(sessao, { ...tarefa, arquivada: true }, "maria")).toMatch(/não encontrada/);
    expect(motivoTarefaInvalida(sessao, null, "maria")).toMatch(/não encontrada/);
    expect(motivoTarefaInvalida(sessao, tarefa, "joao")).toMatch(/não é responsável/);
  });
});

describe("herdarTarefasNaEdicao — corrigir o horário não pode apagar a tarefa", () => {
  it("casa por tipo + projeto e pela ordem, não pelo horário", () => {
    const antes = [
      { tipo: "entrada", projetoId: "p1", tarefaId: "t1" },
      { tipo: "inicio_descanso", projetoId: null, tarefaId: null },
      { tipo: "fim_descanso", projetoId: "p1", tarefaId: "t2" },
      { tipo: "saida", projetoId: null, tarefaId: null },
    ];
    // Mesma jornada, horários corrigidos.
    const novas = antes.map(({ tipo, projetoId }) => ({ tipo, projetoId }));
    expect(herdarTarefasNaEdicao(antes, novas)).toEqual(["t1", null, "t2", null]);
  });

  it("só batida que abre sessão carrega tarefa", () => {
    const r = herdarTarefasNaEdicao(
      [{ tipo: "saida", projetoId: "p1", tarefaId: "x" }],
      [{ tipo: "saida", projetoId: "p1" }],
    );
    expect(r).toEqual([null]);
  });

  it("mudou o projeto da batida: não herda (a tarefa era do projeto antigo)", () => {
    const r = herdarTarefasNaEdicao(
      [{ tipo: "entrada", projetoId: "p1", tarefaId: "t1" }],
      [{ tipo: "entrada", projetoId: "p2" }],
    );
    expect(r).toEqual([null]);
  });

  it("duas voltas do descanso no mesmo projeto herdam cada uma a sua, na ordem", () => {
    const antes = [
      { tipo: "fim_descanso", projetoId: "p1", tarefaId: "a" },
      { tipo: "fim_descanso", projetoId: "p1", tarefaId: "b" },
    ];
    expect(herdarTarefasNaEdicao(antes, [{ tipo: "fim_descanso", projetoId: "p1" }, { tipo: "fim_descanso", projetoId: "p1" }])).toEqual(["a", "b"]);
  });

  it("batida nova sem correspondente antigo fica sem tarefa", () => {
    expect(herdarTarefasNaEdicao([], [{ tipo: "entrada", projetoId: "p1" }])).toEqual([null]);
  });
});
