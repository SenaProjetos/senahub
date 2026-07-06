import { describe, it, expect } from "vitest";
import { avaliarAlertasDoDia } from "@/modules/ponto/alertas";
import type { DiaGrade } from "@/modules/rh/escalas/queries";

const GRADE_PADRAO: DiaGrade = {
  diaSemana: 1,
  ativo: true,
  entrada: "08:00",
  saida: "17:00",
  descansos: [{ inicio: "12:00", fim: "13:00" }],
  horasDia: 8,
  toleranciaMin: 10,
};

// Instante em UTC que cai em `hhmm` no fuso de SP (offset -03:00) no dia 2026-07-06 (segunda).
const agoraEm = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 6, 6, h + 3, m, 0));
};

const chaves = (params: Parameters<typeof avaliarAlertasDoDia>[0]) =>
  avaliarAlertasDoDia(params).map((e) => e.chave);

describe("alertas — grade inativa (folga/fds)", () => {
  it("nunca gera alerta quando a escala do dia está inativa", () => {
    const r = avaliarAlertasDoDia({
      agora: agoraEm("08:00"),
      grade: { ...GRADE_PADRAO, ativo: false },
      batidasHoje: [],
    });
    expect(r).toEqual([]);
  });
});

describe("alertas — entrada", () => {
  it("10min antes da entrada prevista, sem batida ainda: 'prox'", () => {
    expect(chaves({ agora: agoraEm("07:52"), grade: GRADE_PADRAO, batidasHoje: [] })).toContain("entrada:prox");
  });

  it("no minuto exato da entrada, sem batida: 'atingido'", () => {
    expect(chaves({ agora: agoraEm("08:00"), grade: GRADE_PADRAO, batidasHoje: [] })).toContain("entrada:atingido");
  });

  it("30min depois ainda dispara 'atingido'; 31min depois já não", () => {
    expect(chaves({ agora: agoraEm("08:30"), grade: GRADE_PADRAO, batidasHoje: [] })).toContain("entrada:atingido");
    expect(chaves({ agora: agoraEm("08:31"), grade: GRADE_PADRAO, batidasHoje: [] })).not.toContain("entrada:atingido");
  });

  it("já bateu entrada: não alerta mais", () => {
    const batidas = [{ tipo: "entrada" as const, horario: agoraEm("08:00") }];
    expect(chaves({ agora: agoraEm("08:05"), grade: GRADE_PADRAO, batidasHoje: batidas })).not.toContain("entrada:atingido");
  });

  it("fora da janela (bem antes) não alerta", () => {
    expect(chaves({ agora: agoraEm("07:00"), grade: GRADE_PADRAO, batidasHoje: [] })).toEqual([]);
  });
});

describe("alertas — descanso", () => {
  const entrouAs8 = [{ tipo: "entrada" as const, horario: agoraEm("08:00") }];

  it("próximo do início do descanso (trabalhando, sem descanso ainda)", () => {
    expect(chaves({ agora: agoraEm("11:55"), grade: GRADE_PADRAO, batidasHoje: entrouAs8 })).toContain("descanso_inicio:prox");
  });

  it("não alerta início de descanso se ainda não entrou", () => {
    expect(chaves({ agora: agoraEm("11:55"), grade: GRADE_PADRAO, batidasHoje: [] })).not.toContain("descanso_inicio:prox");
  });

  it("não alerta início de descanso se já iniciou", () => {
    const jaDescansando = [...entrouAs8, { tipo: "inicio_descanso" as const, horario: agoraEm("12:00") }];
    expect(chaves({ agora: agoraEm("12:05"), grade: GRADE_PADRAO, batidasHoje: jaDescansando })).not.toContain("descanso_inicio:atingido");
  });

  it("próximo/atingido do fim do descanso quando estado = descansando", () => {
    const emDescanso = [...entrouAs8, { tipo: "inicio_descanso" as const, horario: agoraEm("12:00") }];
    expect(chaves({ agora: agoraEm("12:55"), grade: GRADE_PADRAO, batidasHoje: emDescanso })).toContain("descanso_fim:prox");
    expect(chaves({ agora: agoraEm("13:00"), grade: GRADE_PADRAO, batidasHoje: emDescanso })).toContain("descanso_fim:atingido");
  });
});

describe("alertas — saída", () => {
  const jornadaCompleta = [{ tipo: "entrada" as const, horario: agoraEm("08:00") }];

  it("próximo/atingido da saída enquanto trabalhando", () => {
    expect(chaves({ agora: agoraEm("16:55"), grade: GRADE_PADRAO, batidasHoje: jornadaCompleta })).toContain("saida:prox");
    expect(chaves({ agora: agoraEm("17:10"), grade: GRADE_PADRAO, batidasHoje: jornadaCompleta })).toContain("saida:atingido");
  });

  it("não alerta saída se já saiu (estado fora)", () => {
    const saiu = [...jornadaCompleta, { tipo: "saida" as const, horario: agoraEm("17:00") }];
    expect(chaves({ agora: agoraEm("17:10"), grade: GRADE_PADRAO, batidasHoje: saiu })).not.toContain("saida:atingido");
  });
});

describe("alertas — jornada cumprida", () => {
  it("dispara quando trabalhado >= horasDia (8h)", () => {
    const batidas = [{ tipo: "entrada" as const, horario: agoraEm("08:00") }];
    expect(chaves({ agora: agoraEm("16:00"), grade: GRADE_PADRAO, batidasHoje: batidas })).toContain("jornada_cumprida");
  });

  it("não dispara antes de completar a jornada", () => {
    const batidas = [{ tipo: "entrada" as const, horario: agoraEm("08:00") }];
    expect(chaves({ agora: agoraEm("15:00"), grade: GRADE_PADRAO, batidasHoje: batidas })).not.toContain("jornada_cumprida");
  });

  it("texto do aviso deixa claro que não é hora extra", () => {
    const batidas = [{ tipo: "entrada" as const, horario: agoraEm("08:00") }];
    const eventos = avaliarAlertasDoDia({ agora: agoraEm("16:00"), grade: GRADE_PADRAO, batidasHoje: batidas });
    const jc = eventos.find((e) => e.chave === "jornada_cumprida");
    expect(jc?.corpo.toLowerCase()).toContain("não é cálculo de hora extra");
  });
});
