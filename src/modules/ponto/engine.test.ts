import { describe, it, expect } from "vitest";
import {
  calcularDia,
  intervalosTrabalho,
  intervalosComProjeto,
  transicoesPermitidas,
  podeBater,
  diaLocal,
  diaLocalDate,
  diaSemanaLocal,
  horaLocal,
  minutosDoDia,
  avaliarAtraso,
  type BatidaCalc,
} from "@/modules/ponto/engine";

const b = (tipo: BatidaCalc["tipo"], iso: string): BatidaCalc => ({
  tipo,
  horario: new Date(iso),
});

// `agora` de referência longe do dia dos testes — irrelevante p/ dias passados.
const AGORA = new Date("2026-07-06T12:00:00Z");

describe("engine — calcularDia (dia fechado)", () => {
  it("jornada simples entrada→saída conta o intervalo", () => {
    const r = calcularDia(
      [b("entrada", "2026-07-06T08:00:00Z"), b("saida", "2026-07-06T12:00:00Z")],
      AGORA,
      false,
    );
    expect(r.trabalhadoMin).toBe(240);
    expect(r.descansoMin).toBe(0);
    expect(r.estado).toBe("fora");
    expect(r.aberta).toBe(false);
    expect(r.incompleto).toBe(false);
  });

  it("um descanso é descontado do trabalhado", () => {
    const r = calcularDia(
      [
        b("entrada", "2026-07-06T08:00:00Z"),
        b("inicio_descanso", "2026-07-06T12:00:00Z"),
        b("fim_descanso", "2026-07-06T13:00:00Z"),
        b("saida", "2026-07-06T17:00:00Z"),
      ],
      AGORA,
      false,
    );
    expect(r.trabalhadoMin).toBe(8 * 60); // 4h manhã + 4h tarde
    expect(r.descansoMin).toBe(60);
  });

  it("múltiplos descansos somam corretamente", () => {
    const r = calcularDia(
      [
        b("entrada", "2026-07-06T08:00:00Z"),
        b("inicio_descanso", "2026-07-06T10:00:00Z"),
        b("fim_descanso", "2026-07-06T10:15:00Z"),
        b("inicio_descanso", "2026-07-06T12:00:00Z"),
        b("fim_descanso", "2026-07-06T13:00:00Z"),
        b("saida", "2026-07-06T17:00:00Z"),
      ],
      AGORA,
      false,
    );
    // trabalhado = 2h + 1h45 + 4h = 7h45
    expect(r.trabalhadoMin).toBe(7 * 60 + 45);
    expect(r.descansoMin).toBe(75); // 15 + 60
  });

  it("turno quebrado (saída e nova entrada) soma os dois blocos", () => {
    const r = calcularDia(
      [
        b("entrada", "2026-07-06T08:00:00Z"),
        b("saida", "2026-07-06T12:00:00Z"),
        b("entrada", "2026-07-06T14:00:00Z"),
        b("saida", "2026-07-06T18:00:00Z"),
      ],
      AGORA,
      false,
    );
    expect(r.trabalhadoMin).toBe(8 * 60);
    expect(r.estado).toBe("fora");
    // entrada = primeira; saida = última
    expect(r.entrada?.toISOString()).toBe("2026-07-06T08:00:00.000Z");
    expect(r.saida?.toISOString()).toBe("2026-07-06T18:00:00.000Z");
  });

  it("reordena batidas fora de ordem", () => {
    const r = calcularDia(
      [b("saida", "2026-07-06T12:00:00Z"), b("entrada", "2026-07-06T08:00:00Z")],
      AGORA,
      false,
    );
    expect(r.trabalhadoMin).toBe(240);
    expect(r.inconsistencias).toBe(0);
  });
});

describe("engine — calcularDia (ponta aberta)", () => {
  it("dia corrente conta cronômetro ao vivo até agora", () => {
    const agora = new Date();
    const entrada = new Date(agora.getTime() - 90 * 60_000); // 90 min atrás
    const r = calcularDia([{ tipo: "entrada", horario: entrada }], agora, true);
    expect(r.trabalhadoMin).toBeGreaterThanOrEqual(89);
    expect(r.trabalhadoMin).toBeLessThanOrEqual(91);
    expect(r.aberta).toBe(true);
    expect(r.estado).toBe("trabalhando");
    expect(r.incompleto).toBe(false);
  });

  it("dia passado aberto = incompleto, conta só pares fechados", () => {
    const r = calcularDia(
      [
        b("entrada", "2026-07-05T08:00:00Z"),
        b("inicio_descanso", "2026-07-05T12:00:00Z"),
        b("fim_descanso", "2026-07-05T13:00:00Z"),
        // esqueceu a saída
      ],
      AGORA,
      false,
    );
    expect(r.trabalhadoMin).toBe(240); // só a manhã fechada
    expect(r.incompleto).toBe(true);
    expect(r.aberta).toBe(true);
    expect(r.estado).toBe("trabalhando");
  });

  it("descanso aberto no dia corrente cresce ao vivo, não conta como trabalho", () => {
    const agora = new Date();
    const r = calcularDia(
      [
        { tipo: "entrada", horario: new Date(agora.getTime() - 120 * 60_000) },
        { tipo: "inicio_descanso", horario: new Date(agora.getTime() - 30 * 60_000) },
      ],
      agora,
      true,
    );
    expect(r.trabalhadoMin).toBe(90); // 2h - 30min de descanso
    expect(r.descansoMin).toBeGreaterThanOrEqual(29);
    expect(r.descansoMin).toBeLessThanOrEqual(31);
    expect(r.estado).toBe("descansando");
  });
});

describe("engine — inconsistências", () => {
  it("batida em transição inválida é ignorada e contada", () => {
    const r = calcularDia(
      [
        b("entrada", "2026-07-06T08:00:00Z"),
        b("fim_descanso", "2026-07-06T09:00:00Z"), // sem inicio_descanso
        b("saida", "2026-07-06T12:00:00Z"),
      ],
      AGORA,
      false,
    );
    expect(r.trabalhadoMin).toBe(240); // fim_descanso ignorado
    expect(r.inconsistencias).toBe(1);
  });

  it("dia sem batidas retorna zeros", () => {
    const r = calcularDia([], AGORA, false);
    expect(r.trabalhadoMin).toBe(0);
    expect(r.estado).toBe("fora");
    expect(r.entrada).toBeNull();
    expect(r.aberta).toBe(false);
  });
});

describe("engine — intervalosTrabalho (invariante do rateio)", () => {
  // A soma dos intervalos de trabalho DEVE bater com trabalhadoMin do motor —
  // cada intervalo vira uma SessaoTrabalho, então isto prova Σ sessões == trabalhado.
  function somaMin(
    intervalos: { inicio: Date; fim: Date | null }[],
    agora: Date,
  ): number {
    let ms = 0;
    for (const it of intervalos) {
      const fim = it.fim ?? agora;
      ms += fim.getTime() - it.inicio.getTime();
    }
    return Math.max(0, Math.round(ms / 60000));
  }

  const cenarios: { nome: string; batidas: BatidaCalc[] }[] = [
    {
      nome: "jornada simples",
      batidas: [b("entrada", "2026-07-06T08:00:00Z"), b("saida", "2026-07-06T12:00:00Z")],
    },
    {
      nome: "com descanso",
      batidas: [
        b("entrada", "2026-07-06T08:00:00Z"),
        b("inicio_descanso", "2026-07-06T12:00:00Z"),
        b("fim_descanso", "2026-07-06T13:00:00Z"),
        b("saida", "2026-07-06T17:00:00Z"),
      ],
    },
    {
      nome: "turno quebrado",
      batidas: [
        b("entrada", "2026-07-06T08:00:00Z"),
        b("saida", "2026-07-06T12:00:00Z"),
        b("entrada", "2026-07-06T14:00:00Z"),
        b("saida", "2026-07-06T18:00:00Z"),
      ],
    },
  ];

  for (const c of cenarios) {
    it(`Σ intervalos == trabalhadoMin — ${c.nome}`, () => {
      const intervalos = intervalosTrabalho(c.batidas, false);
      const calc = calcularDia(c.batidas, AGORA, false);
      expect(somaMin(intervalos, AGORA)).toBe(calc.trabalhadoMin);
      expect(intervalos.every((i) => i.fim !== null)).toBe(true); // dia fechado
    });
  }

  it("dia corrente aberto: último intervalo fica em aberto (fim=null) e soma bate ao vivo", () => {
    const agora = new Date();
    const batidas: BatidaCalc[] = [
      { tipo: "entrada", horario: new Date(agora.getTime() - 90 * 60_000) },
    ];
    const intervalos = intervalosTrabalho(batidas, true);
    expect(intervalos).toHaveLength(1);
    expect(intervalos[0].fim).toBeNull();
    const calc = calcularDia(batidas, agora, true);
    expect(somaMin(intervalos, agora)).toBe(calc.trabalhadoMin);
  });

  it("dia passado aberto: NÃO abre intervalo final (só pares fechados)", () => {
    const batidas: BatidaCalc[] = [
      b("entrada", "2026-07-05T08:00:00Z"),
      b("inicio_descanso", "2026-07-05T12:00:00Z"),
      b("fim_descanso", "2026-07-05T13:00:00Z"),
    ];
    const intervalos = intervalosTrabalho(batidas, false);
    expect(intervalos).toHaveLength(1); // só a manhã
    expect(intervalos[0].fim).not.toBeNull();
  });
});

describe("engine — intervalosComProjeto (reconciliação F5)", () => {
  it("cada intervalo recebe o projeto da batida que o abre", () => {
    const batidas = [
      { tipo: "entrada" as const, horario: new Date("2026-07-06T08:00:00Z"), projetoId: "A" },
      { tipo: "inicio_descanso" as const, horario: new Date("2026-07-06T12:00:00Z"), projetoId: null },
      { tipo: "fim_descanso" as const, horario: new Date("2026-07-06T13:00:00Z"), projetoId: "B" },
      { tipo: "saida" as const, horario: new Date("2026-07-06T17:00:00Z"), projetoId: null },
    ];
    const intervalos = intervalosComProjeto(batidas, false);
    expect(intervalos).toHaveLength(2);
    expect(intervalos[0].projetoId).toBe("A"); // manhã abriu no A
    expect(intervalos[1].projetoId).toBe("B"); // tarde reabriu no B
    // soma bate com o motor (mesma invariante)
    const totalMin = intervalos.reduce(
      (acc, i) => acc + Math.round((i.fim!.getTime() - i.inicio.getTime()) / 60000),
      0,
    );
    expect(totalMin).toBe(calcularDia(batidas, AGORA, false).trabalhadoMin);
  });
});

describe("engine — diaLocalDate / diaSemanaLocal", () => {
  it("diaLocalDate devolve meia-noite UTC do dia local de Brasília", () => {
    const d = new Date("2026-07-07T02:00:00Z"); // 23h de 06/07 em SP
    expect(diaLocalDate(d).toISOString()).toBe("2026-07-06T00:00:00.000Z");
  });

  it("diaSemanaLocal usa o dia local (segunda=1)", () => {
    // 2026-07-06 é uma segunda-feira
    expect(diaSemanaLocal(new Date("2026-07-06T12:00:00Z"))).toBe(1);
    // 02:00 UTC de 07/07 ainda é 06/07 (segunda) em SP
    expect(diaSemanaLocal(new Date("2026-07-07T02:00:00Z"))).toBe(1);
  });
});

describe("engine — máquina de estados", () => {
  it("transições permitidas por estado", () => {
    expect(transicoesPermitidas("fora")).toEqual(["entrada"]);
    expect(transicoesPermitidas("trabalhando")).toEqual(["inicio_descanso", "saida"]);
    expect(transicoesPermitidas("descansando")).toEqual(["fim_descanso"]);
  });

  it("podeBater valida a transição", () => {
    expect(podeBater("fora", "entrada")).toBe(true);
    expect(podeBater("fora", "saida")).toBe(false);
    expect(podeBater("trabalhando", "inicio_descanso")).toBe(true);
    expect(podeBater("descansando", "fim_descanso")).toBe(true);
    expect(podeBater("descansando", "saida")).toBe(false);
  });
});

describe("engine — dia/hora local (America/Sao_Paulo)", () => {
  it("diaLocal usa fuso de Brasília, não UTC (bug do espelho antigo)", () => {
    // 02:00 UTC = 23:00 do dia anterior em SP (offset -03:00)
    const d = new Date("2026-07-07T02:00:00Z");
    expect(diaLocal(d)).toBe("2026-07-06");
    expect(d.toISOString().slice(0, 10)).toBe("2026-07-07"); // o bug antigo
  });

  it("horaLocal formata HH:MM em 24h no fuso de SP", () => {
    expect(horaLocal(new Date("2026-07-06T11:15:00Z"))).toBe("08:15"); // 11:15 UTC → 08:15 SP
    expect(horaLocal(new Date("2026-07-07T02:00:00Z"))).toBe("23:00");
  });

  it("minutosDoDia converte HH:MM em minutos", () => {
    expect(minutosDoDia("08:00")).toBe(480);
    expect(minutosDoDia("00:00")).toBe(0);
    expect(minutosDoDia("23:59")).toBe(1439);
  });
});

describe("engine — avaliarAtraso (S3)", () => {
  const entrada = (hhmmSP: string) => {
    // monta um instante UTC que, em SP (-03:00), cai em hhmmSP
    const [h, m] = hhmmSP.split(":").map(Number);
    return new Date(Date.UTC(2026, 6, 6, h + 3, m, 0));
  };

  it("dentro da tolerância não é atraso", () => {
    expect(avaliarAtraso(entrada("08:08"), "08:00", 10)).toEqual({
      atrasado: false,
      atrasoMin: 0,
    });
  });

  it("além da tolerância é atraso (só o excedente)", () => {
    expect(avaliarAtraso(entrada("08:15"), "08:00", 10)).toEqual({
      atrasado: true,
      atrasoMin: 5,
    });
  });

  it("sem escala ou sem entrada não avalia", () => {
    expect(avaliarAtraso(null, "08:00", 10).atrasado).toBe(false);
    expect(avaliarAtraso(entrada("09:00"), null, 10).atrasado).toBe(false);
  });
});
