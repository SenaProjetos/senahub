import { describe, expect, it } from "vitest";
import {
  agregarHoras,
  chaveDestino,
  DESTINO_OUTROS,
  DESTINO_REUNIOES,
  DESTINO_SEM_PROJETO,
  empilharPorDestino,
  somarPorBucket,
  type SessaoHoras,
} from "./horas";
import { bucketsDoPeriodo, listarDias } from "./periodo";

// Horários em -03:00 (Brasília) para o dia local ficar óbvio no teste.
const t = (s: string) => new Date(`${s}-03:00`);
const AGORA = t("2026-10-07T15:00:00");
const proj = (n: number) => ({ id: `p${n}`, codigo: `26000${n}`, nome: `Projeto ${n}` });

function sessao(over: Partial<SessaoHoras>): SessaoHoras {
  return {
    userId: "u1",
    inicio: t("2026-10-06T08:00:00"),
    fim: t("2026-10-06T12:00:00"),
    tipoAlocacao: "projeto",
    projeto: proj(1),
    ...over,
  };
}

const PERIODO = { de: "2026-10-05", ate: "2026-10-07", agora: AGORA };

describe("chaveDestino", () => {
  it("projeto, reunião (interna e externa juntas) e sem projeto", () => {
    expect(chaveDestino({ tipoAlocacao: "projeto", projeto: proj(1) })).toBe("p:p1");
    expect(chaveDestino({ tipoAlocacao: "reuniao_interna", projeto: null })).toBe(DESTINO_REUNIOES);
    expect(chaveDestino({ tipoAlocacao: "reuniao_externa", projeto: null })).toBe(DESTINO_REUNIOES);
    expect(chaveDestino({ tipoAlocacao: "sem_projeto", projeto: null })).toBe(DESTINO_SEM_PROJETO);
  });
  it("tipo projeto sem projeto (dado ruim) conta como sem projeto, nunca some", () => {
    expect(chaveDestino({ tipoAlocacao: "projeto", projeto: null })).toBe(DESTINO_SEM_PROJETO);
  });
});

describe("agregarHoras", () => {
  it("uma entrada por userId pedido, na ordem pedida, mesmo sem horas", () => {
    const r = agregarHoras([sessao({})], { ...PERIODO, userIds: ["u2", "u1"] });
    expect(r.dias).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"]);
    expect(r.pessoas.map((p) => p.userId)).toEqual(["u2", "u1"]);
    expect(r.pessoas[0]).toMatchObject({ totalHoras: 0, diasComRegistro: 0, mediaPorDiaComRegistro: 0, porDia: [0, 0, 0] });
  });

  it("soma por dia e por destino, com rótulo do projeto", () => {
    const r = agregarHoras(
      [
        sessao({}),
        sessao({ inicio: t("2026-10-06T13:00:00"), fim: t("2026-10-06T14:30:00"), tipoAlocacao: "reuniao_externa", projeto: null }),
      ],
      { ...PERIODO, userIds: ["u1"] },
    );
    const p = r.pessoas[0];
    expect(p.porDia).toEqual([0, 5.5, 0]);
    expect(p.porDestino["p:p1"]).toEqual([0, 4, 0]);
    expect(p.porDestino[DESTINO_REUNIOES]).toEqual([0, 1.5, 0]);
    expect(r.destinos["p:p1"]).toBe("260001 · Projeto 1");
    expect(r.destinos[DESTINO_REUNIOES]).toBe("Reuniões");
    expect(p).toMatchObject({ totalHoras: 5.5, diasComRegistro: 1, mediaPorDiaComRegistro: 5.5 });
  });

  it("sessão que cruza a meia-noite reparte entre os dois dias", () => {
    const r = agregarHoras([sessao({ inicio: t("2026-10-05T22:00:00"), fim: t("2026-10-06T01:00:00") })], {
      ...PERIODO,
      userIds: ["u1"],
    });
    expect(r.pessoas[0].porDia).toEqual([2, 1, 0]);
    expect(r.pessoas[0].diasComRegistro).toBe(2);
    expect(r.pessoas[0].mediaPorDiaComRegistro).toBe(1.5);
  });

  it("sessão aberta conta até agora, nunca no futuro", () => {
    const r = agregarHoras([sessao({ inicio: t("2026-10-07T13:00:00"), fim: null })], { ...PERIODO, userIds: ["u1"] });
    expect(r.pessoas[0].porDia).toEqual([0, 0, 2]);
  });

  it("descarta o que cai fora do período", () => {
    const r = agregarHoras([sessao({ inicio: t("2026-10-04T23:00:00"), fim: t("2026-10-05T01:00:00") })], {
      ...PERIODO,
      userIds: ["u1"],
    });
    expect(r.pessoas[0].porDia).toEqual([1, 0, 0]);
    expect(r.pessoas[0].totalHoras).toBe(1);
  });

  it("ignora sessão de quem não foi pedido", () => {
    const r = agregarHoras([sessao({ userId: "intruso" })], { ...PERIODO, userIds: ["u1"] });
    expect(r.pessoas).toHaveLength(1);
    expect(r.pessoas[0].totalHoras).toBe(0);
  });

  it("arredonda só na borda: 3 × 20 min = 1h, não 0,9h", () => {
    const r = agregarHoras(
      [8, 9, 10].map((h) => {
        const hh = String(h).padStart(2, "0");
        return sessao({ inicio: t(`2026-10-06T${hh}:00:00`), fim: t(`2026-10-06T${hh}:20:00`) });
      }),
      { ...PERIODO, userIds: ["u1"] },
    );
    expect(r.pessoas[0].totalHoras).toBe(1);
    expect(r.pessoas[0].porDia[1]).toBe(1);
  });
});

describe("empilharPorDestino", () => {
  it("top 5 projetos + Outros + Reuniões + Sem projeto, só o que tem horas", () => {
    const sessoes: SessaoHoras[] = [];
    // 7 projetos com 7h, 6h, … 1h no mesmo dia
    for (let n = 1; n <= 7; n++) {
      const inicio = t("2026-10-06T00:00:00");
      sessoes.push(sessao({ projeto: proj(n), inicio, fim: new Date(inicio.getTime() + (8 - n) * 3_600_000) }));
    }
    sessoes.push(sessao({ tipoAlocacao: "sem_projeto", projeto: null, inicio: t("2026-10-07T08:00:00"), fim: t("2026-10-07T09:00:00") }));
    const r = agregarHoras(sessoes, { ...PERIODO, userIds: ["u1"] });
    const series = empilharPorDestino(r.pessoas[0], r.destinos);
    expect(series.map((s) => s.chave)).toEqual(["p:p1", "p:p2", "p:p3", "p:p4", "p:p5", DESTINO_OUTROS, DESTINO_SEM_PROJETO]);
    expect(series.find((s) => s.chave === DESTINO_OUTROS)).toMatchObject({ rotulo: "Outros projetos", valores: [0, 3, 0] });
    // a pilha soma o total do dia
    const somaDia1 = series.reduce((s, x) => s + x.valores[1], 0);
    expect(somaDia1).toBeCloseTo(r.pessoas[0].porDia[1], 5);
  });
});

describe("pilha bate com o total (arredondamento só na borda)", () => {
  it("3 projetos × 20 min no mesmo dia somam 1h na pilha, no dia e na semana — não 0,9h", () => {
    const sessoes = [1, 2, 3].map((n) => {
      const hh = String(7 + n).padStart(2, "0");
      return sessao({ projeto: proj(n), inicio: t(`2026-10-06T${hh}:00:00`), fim: t(`2026-10-06T${hh}:20:00`) });
    });
    const r = agregarHoras(sessoes, { ...PERIODO, userIds: ["u1"] });
    const p = r.pessoas[0];
    expect(p.totalHoras).toBe(1);
    const series = empilharPorDestino(p, r.destinos);
    const buckets = bucketsDoPeriodo(r.dias, "semana");
    const pilhaDoDia = series.reduce((s, x) => s + x.valores[1], 0);
    const pilhaDaSemana = series.reduce((s, x) => s + somarPorBucket(x.valores, buckets).reduce((a, b) => a + b, 0), 0);
    expect(pilhaDoDia).toBeCloseTo(1, 6);
    expect(pilhaDaSemana).toBeCloseTo(1, 6);
    expect(somarPorBucket(p.porDia, buckets).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });
});

describe("somarPorBucket", () => {
  it("soma por semana sem perder hora", () => {
    const dias = listarDias("2026-09-30", "2026-10-06"); // qua → ter
    const valores = [1, 1, 1, 1, 1, 2, 2.5];
    const buckets = bucketsDoPeriodo(dias, "semana");
    expect(somarPorBucket(valores, buckets)).toEqual([5, 4.5]);
  });
});
