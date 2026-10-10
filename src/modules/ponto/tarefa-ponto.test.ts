import { describe, expect, it } from "vitest";
import {
  FOLGA_JANELA_DIAS,
  MAX_OUTRAS_DA_ETAPA,
  MAX_TAREFAS_NO_PONTO,
  estaAtrasada,
  listaDoPonto,
  sugestaoDoPonto,
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

  it("card de EAP futuro some; atrasado e aberto fica (decisão 1 de 08/10); manual fica", () => {
    const r = tarefasDoPeriodo(
      [
        t("futura", { janela: { inicio: "2026-12-01", fim: "2026-12-10" } }),
        t("velha", { janela: { inicio: "2026-06-01", fim: "2026-06-10" } }),
        t("agora", { janela: { inicio: "2026-10-05", fim: "2026-10-09" } }),
        t("manual"),
      ],
      hoje,
    );
    expect(r.map((x) => x.id).sort()).toEqual(["agora", "manual", "velha"]);
    expect(r.find((x) => x.id === "velha")?.atrasada).toBe(true);
    expect(r.find((x) => x.id === "agora")?.atrasada).toBe(false);
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

  it("atrasadas vêm antes de tudo, a de término mais antigo primeiro", () => {
    const r = tarefasDoPeriodo(
      [
        t("agora", { janela: { inicio: "2026-10-05", fim: "2026-10-09" } }),
        t("atrasada-recente", { janela: { inicio: "2026-10-01", fim: "2026-10-06" } }),
        t("atrasada-antiga", { janela: { inicio: "2026-08-01", fim: "2026-08-10" } }),
      ],
      hoje,
    );
    expect(r.map((x) => x.id)).toEqual(["atrasada-antiga", "atrasada-recente", "agora"]);
  });
});

describe("estaAtrasada", () => {
  it("só depois do término, e nunca para card manual", () => {
    const j = { inicio: "2026-10-01", fim: "2026-10-06" };
    expect(estaAtrasada(j, "2026-10-06")).toBe(false);
    expect(estaAtrasada(j, "2026-10-07")).toBe(true);
    expect(estaAtrasada(null, "2026-10-07")).toBe(false);
  });
});

describe("listaDoPonto — lista curta + outras da etapa recolhidas", () => {
  const hoje = "2026-10-07";
  const BAS = "estrutural:bas";
  const EXE = "estrutural:exe";

  it("traz, recolhidas, as da mesma etapa que ficaram fora da janela; nunca outra etapa", () => {
    const r = listaDoPonto(
      [
        t("modelagem", { janela: { inicio: "2026-10-05", fim: "2026-10-09" }, etapa: BAS }),
        t("documentacao", { janela: { inicio: "2026-10-26", fim: "2026-10-30" }, etapa: BAS }),
        t("revisao", { janela: { inicio: "2026-10-19", fim: "2026-10-21" }, etapa: BAS }),
        t("executivo", { janela: { inicio: "2026-11-20", fim: "2026-11-30" }, etapa: EXE }),
      ],
      hoje,
    );
    expect(r.map((x) => [x.id, x.grupo])).toEqual([
      ["modelagem", "periodo"],
      ["revisao", "etapa"],
      ["documentacao", "etapa"],
    ]);
  });

  it("o que passa do teto da lista curta vai para as outras, sem sumir", () => {
    const muitas = Array.from({ length: 12 }, (_, i) => t(`m${i}`, { titulo: `T${String(i).padStart(2, "0")}` }));
    const r = listaDoPonto(muitas, hoje);
    expect(r.filter((x) => x.grupo === "periodo")).toHaveLength(MAX_TAREFAS_NO_PONTO);
    expect(r.filter((x) => x.grupo === "etapa")).toHaveLength(12 - MAX_TAREFAS_NO_PONTO);
  });

  it("as outras têm teto próprio", () => {
    const muitas = [
      t("agora", { janela: { inicio: "2026-10-05", fim: "2026-10-09" }, etapa: BAS }),
      ...Array.from({ length: 40 }, (_, i) =>
        t(`f${i}`, { janela: { inicio: "2026-12-01", fim: "2026-12-02" }, etapa: BAS }),
      ),
    ];
    expect(listaDoPonto(muitas, hoje).filter((x) => x.grupo === "etapa")).toHaveLength(MAX_OUTRAS_DA_ETAPA);
  });
});

describe("sugestaoDoPonto — o ponto abre na atividade de hoje", () => {
  const hoje = "2026-10-07";
  const c = (id: string, projetoId: string, extra: Partial<TarefaCandidata> = {}) => ({ ...t(id, extra), projetoId });

  it("atrasada vence a de hoje; entre atrasadas, a de término mais antigo", () => {
    const r = sugestaoDoPonto(
      [
        c("hoje", "p1", { janela: { inicio: "2026-10-06", fim: "2026-10-09" } }),
        c("atrasada", "p2", { janela: { inicio: "2026-09-20", fim: "2026-10-02" } }),
        c("mais-atrasada", "p3", { janela: { inicio: "2026-09-01", fim: "2026-09-10" } }),
      ],
      hoje,
    );
    expect(r?.id).toBe("mais-atrasada");
    expect(r?.projetoId).toBe("p3");
  });

  it("sem atrasada, a da janela exata de hoje que começou antes", () => {
    const r = sugestaoDoPonto(
      [
        c("depois", "p1", { janela: { inicio: "2026-10-07", fim: "2026-10-09" } }),
        c("antes", "p2", { janela: { inicio: "2026-10-01", fim: "2026-10-09" } }),
      ],
      hoje,
    );
    expect(r?.id).toBe("antes");
  });

  it("card manual e janela só na folga não sugerem nada", () => {
    expect(
      sugestaoDoPonto(
        [c("manual", "p1"), c("semana-que-vem", "p1", { janela: { inicio: "2026-10-12", fim: "2026-10-14" } })],
        hoje,
      ),
    ).toBeNull();
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
