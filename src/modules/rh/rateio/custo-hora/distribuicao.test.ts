import { describe, expect, it } from "vitest";
import {
  anosCompletos, baseDoHoleriteCent, calculoDoMes, divisorMinutos, fracaoForaDeFerias, inicioDoTempoDeCasa,
  jornadaReferenciaMinutos, limitesDoMesSP, minutosNoIntervalo, naturezaDaSessao, ratearCusto, tabelaVigente,
} from "./distribuicao";

describe("ratearCusto", () => {
  it("CLT: o custo do mês inteiro vai para as horas marcadas, centavo a centavo", () => {
    const r = ratearCusto(639621, 9600, [
      { chave: "a", minutos: 6000 },
      { chave: "b", minutos: 3000 },
      { chave: "c", minutos: 600 },
    ]);
    expect(r.porLinha.get("a")).toBe(399763);
    expect(r.porLinha.get("b")).toBe(199882);
    expect(r.porLinha.get("c")).toBe(39976);
    expect(r.naoApontadoCent).toBe(0);
  });

  it("sócio: o que passa da jornada de referência vira 'não apontado'", () => {
    const r = ratearCusto(1000000, 9600, [{ chave: "p", minutos: 2400 }]);
    expect(r.porLinha.get("p")).toBe(250000);
    expect(r.naoApontadoCent).toBe(750000);
  });

  it("sem horas: o custo inteiro fica fora dos projetos", () => {
    const r = ratearCusto(500000, 0, []);
    expect(r.naoApontadoCent).toBe(500000);
  });

  it("divisor menor que as horas marcadas nunca reparte mais que o total", () => {
    const r = ratearCusto(1000, 60, [{ chave: "a", minutos: 90 }, { chave: "b", minutos: 30 }]);
    expect((r.porLinha.get("a") ?? 0) + (r.porLinha.get("b") ?? 0) + r.naoApontadoCent).toBe(1000);
  });
});

describe("divisorMinutos", () => {
  it("CLT e estágio dividem pelas horas marcadas", () => {
    expect(divisorMinutos({ contratacao: "clt", minutosMarcados: 12000, jornadaReferenciaMin: 9600 })).toBe(12000);
  });
  it("sócio divide pela jornada de referência", () => {
    expect(divisorMinutos({ contratacao: "pro_labore", minutosMarcados: 2400, jornadaReferenciaMin: 9600 })).toBe(9600);
  });
  it("sócio que apontou mais que a referência divide pelo apontado (o custo nunca passa do pró-labore)", () => {
    expect(divisorMinutos({ contratacao: "pro_labore", minutosMarcados: 12000, jornadaReferenciaMin: 9600 })).toBe(12000);
  });
});

describe("jornadaReferenciaMinutos", () => {
  it("40h semanais em 20 dias úteis = 160h", () => expect(jornadaReferenciaMinutos(40, 20)).toBe(9600));
  it("sem carga cadastrada usa 40h", () => expect(jornadaReferenciaMinutos(null, 20)).toBe(9600));
  it("30h semanais em 22 dias úteis = 132h", () => expect(jornadaReferenciaMinutos(30, 22)).toBe(7920));
});

describe("minutosNoIntervalo e limitesDoMesSP", () => {
  const out = limitesDoMesSP(2026, 10);
  const nov = limitesDoMesSP(2026, 11);
  const agora = new Date("2026-12-01T12:00:00-03:00");
  const ini = new Date("2026-10-31T22:00:00-03:00");
  const fim = new Date("2026-11-01T02:00:00-03:00");

  it("limites do mês em horário de São Paulo", () => {
    expect(out.inicio.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(out.fim.toISOString()).toBe("2026-11-01T03:00:00.000Z");
    expect(limitesDoMesSP(2026, 12).fim.toISOString()).toBe("2027-01-01T03:00:00.000Z");
  });
  it("sessão que vira o mês é cortada: 2h em outubro e 2h em novembro", () => {
    expect(minutosNoIntervalo(ini, fim, out.inicio, out.fim, agora)).toBe(120);
    expect(minutosNoIntervalo(ini, fim, nov.inicio, nov.fim, agora)).toBe(120);
  });
  it("sessão aberta conta até agora", () => {
    const a = new Date("2026-10-10T08:00:00-03:00");
    expect(minutosNoIntervalo(a, null, out.inicio, out.fim, new Date("2026-10-10T09:30:00-03:00"))).toBe(90);
  });
  it("sessão fora do mês dá zero", () => {
    expect(minutosNoIntervalo(new Date("2026-09-01T08:00:00-03:00"), new Date("2026-09-01T09:00:00-03:00"), out.inicio, out.fim, agora)).toBe(0);
  });
});

describe("naturezaDaSessao", () => {
  it("separa projeto, reunião com projeto e o resto", () => {
    expect(naturezaDaSessao("p1", "projeto")).toBe("projeto");
    expect(naturezaDaSessao("p1", "reuniao_externa")).toBe("reuniao");
    expect(naturezaDaSessao(null, "reuniao_interna")).toBe("nao_alocado");
    expect(naturezaDaSessao(null, "sem_projeto")).toBe("nao_alocado");
  });
});

describe("tempo de casa", () => {
  it("anos completos respeitam o dia do aniversário", () => {
    expect(anosCompletos("2023-11-15", "2026-11-14")).toBe(2);
    expect(anosCompletos("2023-11-15", "2026-11-15")).toBe(3);
    expect(anosCompletos("2026-10-01", "2026-10-31")).toBe(0);
  });
  it("troca de setor no mesmo CLT não zera o tempo de casa", () => {
    const vinculos = [
      { contratacao: "clt" as const, dataInicio: "2022-03-01", dataFim: "2025-06-30" },
      { contratacao: "clt" as const, dataInicio: "2025-07-01", dataFim: null },
    ];
    expect(inicioDoTempoDeCasa(vinculos, "clt", "2026-10-31")).toBe("2022-03-01");
  });
  it("estágio antes do CLT não conta", () => {
    const vinculos = [
      { contratacao: "estagio" as const, dataInicio: "2024-01-01", dataFim: "2025-12-31" },
      { contratacao: "clt" as const, dataInicio: "2026-01-01", dataFim: null },
    ];
    expect(inicioDoTempoDeCasa(vinculos, "clt", "2026-10-31")).toBe("2026-01-01");
  });
  it("buraco entre vínculos recomeça a contagem", () => {
    const vinculos = [
      { contratacao: "clt" as const, dataInicio: "2020-01-01", dataFim: "2021-12-31" },
      { contratacao: "clt" as const, dataInicio: "2023-01-01", dataFim: null },
    ];
    expect(inicioDoTempoDeCasa(vinculos, "clt", "2026-10-31")).toBe("2023-01-01");
  });
});

describe("fracaoForaDeFerias", () => {
  it("metade do mês em férias", () => expect(fracaoForaDeFerias(22, 11)).toBe(0.5));
  it("mês sem dia útil não divide por zero", () => expect(fracaoForaDeFerias(0, 0)).toBe(1));
});

describe("tabelaVigente", () => {
  const v = [{ vigenciaEm: "2026-10-01", id: "a" }, { vigenciaEm: "2027-01-01", id: "b" }];
  it("pega a última com vigência até o mês", () => expect(tabelaVigente(v, "2026-12-01")?.versao.id).toBe("a"));
  it("mês da troca já usa a nova", () => expect(tabelaVigente(v, "2027-01-01")?.versao.id).toBe("b"));
  it("mês anterior a todas usa a primeira e avisa", () => expect(tabelaVigente(v, "2026-08-01")).toEqual({ versao: v[0], posterior: true }));
  it("sem versão nenhuma", () => expect(tabelaVigente([], "2026-10-01")).toBeNull());
});

describe("baseDoHoleriteCent", () => {
  it("soma proventos e ignora descontos e salário-família", () => {
    expect(baseDoHoleriteCent([
      { tipo: "provento", valorCent: 364665, descricao: "Salário Base" },
      { tipo: "provento", valorCent: 20000, descricao: "Horas extras 50%" },
      { tipo: "provento", valorCent: 6553, descricao: "Salário Família" },
      { tipo: "provento", valorCent: 6553, descricao: "SAL. FAMILIA" },
      { tipo: "desconto", valorCent: 30000, descricao: "INSS" },
    ])).toBe(384665);
  });
});

describe("calculoDoMes", () => {
  it("antes do corte é o cálculo antigo", () => expect(calculoDoMes(2026, 9, "2026-10")).toBe("legado"));
  it("a partir do corte é o novo", () => expect(calculoDoMes(2026, 10, "2026-10")).toBe("v2"));
});
