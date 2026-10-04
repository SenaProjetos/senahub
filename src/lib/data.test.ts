import { describe, it, expect } from "vitest";
import {
  paraData,
  inicioDoDia,
  inicioDoDiaLocal,
  inicioDoDiaUtc,
  diaDeSaoPaulo,
  dataHoraDeSaoPaulo,
  hojeParaBanco,
  somarMesesUtc,
  utcFimDoDia,
  utcInicioDoDia,
  diferencaEmDias,
  prazoVencido,
  diasVencidos,
} from "./data";

/**
 * Regressão do bug "um dia a menos": o banco devolve prazos como meia-noite UTC
 * e `getDate()` direto dava o dia anterior em America/Sao_Paulo — o card de
 * /projetos mostrava 02/09 e o painel do projeto 01/09 para o MESMO campo.
 * As asserções valem em qualquer fuso (em UTC+ o dia já era o certo).
 */
describe("paraData", () => {
  it("mantém o dia de um DateTime em meia-noite UTC (campo de data do Prisma)", () => {
    const d = paraData(new Date("2026-09-02T00:00:00.000Z"))!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(2);
  });

  it("aceita a mesma data já serializada em string ISO", () => {
    expect(paraData("2026-09-02T00:00:00.000Z")!.getDate()).toBe(2);
  });

  it("trata yyyy-mm-dd puro como data local", () => {
    const d = paraData("2026-09-02")!;
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(2);
  });

  it("preserva instantes com hora (não são data-calendário)", () => {
    const iso = "2026-09-02T14:30:00.000Z";
    expect(paraData(iso)!.getTime()).toBe(new Date(iso).getTime());
  });

  it("devolve null para nulo/indefinido/inválido", () => {
    expect(paraData(null)).toBeNull();
    expect(paraData(undefined)).toBeNull();
    expect(paraData("não-é-data")).toBeNull();
  });
});

describe("inicioDoDia", () => {
  it("zera a hora mantendo o dia da meia-noite UTC", () => {
    const d = inicioDoDia(new Date("2026-09-02T00:00:00.000Z"))!;
    expect(d.getDate()).toBe(2);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it("zera a hora de um instante com hora, sem trocar o dia local", () => {
    const agora = new Date(2026, 8, 2, 17, 45);
    const d = inicioDoDia(agora)!;
    expect(d.getDate()).toBe(2);
    expect(d.getHours()).toBe(0);
  });

  it("devolve null quando não há data", () => {
    expect(inicioDoDia(null)).toBeNull();
  });
});

describe("inicioDoDiaUtc", () => {
  it("devolve a meia-noite UTC do dia LOCAL, mesmo à noite em fuso atrás de UTC", () => {
    // 02/09 21:00 em BRT já é 03/09 em UTC — `toISOString()` erraria o dia aqui.
    const d = inicioDoDiaUtc(new Date(2026, 8, 2, 21, 0));
    expect(d.toISOString()).toBe("2026-09-02T00:00:00.000Z");
  });

  it("casa com o registro do próprio dia numa fronteira `gte`", () => {
    const registroDeHoje = new Date("2026-09-02T00:00:00.000Z");
    expect(registroDeHoje >= inicioDoDiaUtc(new Date(2026, 8, 2, 21, 0))).toBe(true);
  });

});

describe("inicioDoDiaLocal", () => {
  it("não cai na heurística de data-do-banco às 21:00:00.000 em BRT", () => {
    // Esse instante tem todos os componentes UTC zerados (03/09 00:00Z).
    const d = inicioDoDiaLocal(new Date(2026, 8, 2, 21, 0, 0, 0));
    expect(d.getDate()).toBe(2);
    expect(d.getHours()).toBe(0);
  });
});

// Prazo do banco: meia-noite UTC. "Agora": instante local qualquer do dia.
const prazoDia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("prazoVencido", () => {
  it("não vence no próprio dia do prazo, nem no fim da tarde", () => {
    expect(prazoVencido(prazoDia("2026-09-02"), new Date(2026, 8, 2, 0, 1))).toBe(false);
    expect(prazoVencido(prazoDia("2026-09-02"), new Date(2026, 8, 2, 23, 59))).toBe(false);
  });

  it("vence no dia seguinte", () => {
    expect(prazoVencido(prazoDia("2026-09-02"), new Date(2026, 8, 3, 0, 1))).toBe(true);
  });

  it("é falso sem prazo", () => {
    expect(prazoVencido(null)).toBe(false);
  });
});

describe("diasVencidos", () => {
  it("zero no próprio dia do prazo", () => {
    expect(diasVencidos(prazoDia("2026-09-02"), new Date(2026, 8, 2, 18, 0))).toBe(0);
  });

  it("conta dias inteiros depois", () => {
    expect(diasVencidos(prazoDia("2026-09-02"), new Date(2026, 8, 5, 7, 0))).toBe(3);
  });

  it("zero quando ainda falta", () => {
    expect(diasVencidos(prazoDia("2026-09-10"), new Date(2026, 8, 2, 7, 0))).toBe(0);
  });
});

describe("diferencaEmDias", () => {
  it("conta dias-calendário, ignorando a hora", () => {
    expect(diferencaEmDias(new Date(2026, 8, 2, 23, 0), prazoDia("2026-09-05"))).toBe(3);
  });

  it("zero quando entrega cai no dia do prazo", () => {
    expect(diferencaEmDias(prazoDia("2026-09-02"), new Date(2026, 8, 2, 16, 30))).toBe(0);
  });

  it("null sem uma das pontas", () => {
    expect(diferencaEmDias(null, prazoDia("2026-09-02"))).toBeNull();
  });
});

describe("hojeParaBanco / diaDeSaoPaulo (A9)", () => {
  it("22h de 02/09 em São Paulo ainda é 02/09 (new Date() cru gravaria 03/09)", () => {
    const instante = new Date("2026-09-03T01:00:00.000Z"); // 22:00 BRT de 02/09
    expect(diaDeSaoPaulo(instante)).toBe("2026-09-02");
    expect(hojeParaBanco(instante).toISOString()).toBe("2026-09-02T00:00:00.000Z");
  });
  it("virada: 00:30 BRT já é o dia novo", () => {
    expect(diaDeSaoPaulo(new Date("2026-09-03T03:30:00.000Z"))).toBe("2026-09-03");
  });
  it("manhã comum não muda", () => {
    expect(hojeParaBanco(new Date("2026-09-02T13:00:00.000Z")).toISOString()).toBe("2026-09-02T00:00:00.000Z");
  });
});

describe("dataHoraDeSaoPaulo", () => {
  it("hora de São Paulo, sem fuso, no formato do FILE_NAME do IFC", () => {
    expect(dataHoraDeSaoPaulo(new Date("2026-10-04T13:05:09.000Z"))).toBe("2026-10-04T10:05:09");
  });
  it("23h30 em São Paulo ainda é o dia anterior ao UTC", () => {
    expect(dataHoraDeSaoPaulo(new Date("2026-10-05T02:30:00.000Z"))).toBe("2026-10-04T23:30:00");
  });
  it("meia-noite sai 00, não 24", () => {
    expect(dataHoraDeSaoPaulo(new Date("2026-10-04T03:00:00.000Z"))).toBe("2026-10-04T00:00:00");
  });
});

describe("somarMesesUtc (A9)", () => {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  it("31/01 + 1 mês = 28/02 (date-fns em hora local pularia para 01/03)", () => {
    expect(iso(somarMesesUtc(new Date("2026-01-31T00:00:00.000Z"), 1))).toBe("2026-02-28");
    expect(iso(somarMesesUtc(new Date("2026-01-29T00:00:00.000Z"), 1))).toBe("2026-02-28");
  });
  it("vira o ano e respeita bissexto", () => {
    expect(iso(somarMesesUtc(new Date("2026-11-30T00:00:00.000Z"), 3))).toBe("2027-02-28");
    expect(iso(somarMesesUtc(new Date("2028-01-31T00:00:00.000Z"), 1))).toBe("2028-02-29");
  });
  it("zero e dia comum não mudam", () => {
    expect(iso(somarMesesUtc(new Date("2026-05-10T00:00:00.000Z"), 0))).toBe("2026-05-10");
    expect(iso(somarMesesUtc(new Date("2026-05-10T00:00:00.000Z"), 2))).toBe("2026-07-10");
  });
});

describe("fronteiras de período em UTC (A9)", () => {
  it("o dia 1 gravado (00:00Z) está DENTRO do mês, e o dia 1 do mês seguinte, fora", () => {
    const ini = utcInicioDoDia(2026, 8);
    const fim = utcFimDoDia(2026, 9, 0);
    const dia1 = new Date("2026-09-01T00:00:00.000Z");
    const proximoDia1 = new Date("2026-10-01T00:00:00.000Z");
    expect(dia1 >= ini && dia1 <= fim).toBe(true);
    expect(proximoDia1 <= fim).toBe(false);
    expect(fim.toISOString()).toBe("2026-09-30T23:59:59.999Z");
  });
});
