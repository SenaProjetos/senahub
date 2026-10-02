import { describe, expect, it } from "vitest";
import {
  avisoDoVinculo,
  avisosDeRecorrencia,
  candidatosDeVinculo,
  competenciaDe,
  competenciaDoVencimento,
  competenciasAGerar,
  competenciasNoPeriodo,
  daProgramado,
  descreverVencimento,
  enesimoDiaUtil,
  eventosProgramados,
  idDoProgramado,
  MOTIVO_PROGRAMADO,
  proximaCompetencia,
  rotuloDaCompetencia,
  vencimentoDa,
  vencimentoDoCompromisso,
  type CompromissoRecorrenteEntrada,
  type LancamentoDaCompetencia,
} from "@/modules/financeiro/recorrencia/calculo";
import { reais } from "@/modules/financeiro/liquidez/fixtures";
import { criarCalendario } from "@/lib/calendario-trabalho";

/** Calendário sem feriados: os casos antigos são de dia fixo e não dependem dele. */
const CAL = criarCalendario();

const pro = (p: Partial<CompromissoRecorrenteEntrada> = {}): CompromissoRecorrenteEntrada => ({
  id: "c1",
  descricao: "Pró-labore",
  valor: reais(6_000),
  diaVencimento: 5,
  regraVencimento: "dia_fixo",
  mesesAteVencimento: 0,
  adiantamento: false,
  competenciaInicio: "2026-01",
  competenciaFim: null,
  antecedenciaDias: 5,
  ativo: true,
  prioridade: "p2",
  caixinhaId: null,
  socioId: "s1",
  categoriaId: "cat-prolabore",
  categoriaNome: "Pró-labore",
  natureza: "resultado",
  socioNome: "Ana",
  ...p,
});

describe("competência e vencimento", () => {
  it("lê, avança e escreve o mês", () => {
    expect(competenciaDe("2026-10-07")).toBe("2026-10");
    expect(proximaCompetencia("2026-12")).toBe("2027-01");
    expect(proximaCompetencia("2026-01")).toBe("2026-02");
    expect(rotuloDaCompetencia("2026-10")).toBe("out/2026");
  });

  it("dia 31 cai no último dia do mês curto (e fevereiro bissexto)", () => {
    expect(vencimentoDa("2026-10", 31)).toBe("2026-10-31");
    expect(vencimentoDa("2026-11", 31)).toBe("2026-11-30");
    expect(vencimentoDa("2026-02", 31)).toBe("2026-02-28");
    expect(vencimentoDa("2028-02", 31)).toBe("2028-02-29");
    expect(vencimentoDa("2026-10", 0)).toBe("2026-10-01");
  });

  it("id do mês programado vai e volta", () => {
    expect(daProgramado(idDoProgramado("c1", "2026-10"))).toEqual({ compromissoId: "c1", competencia: "2026-10" });
    expect(daProgramado("lanc-123")).toBeNull();
  });
});

describe("competenciasNoPeriodo (spec §12: no máximo ⌈H/28⌉+1)", () => {
  it("30 dias pegam os vencimentos do período, não mais que o teto", () => {
    const c = competenciasNoPeriodo(pro(), "2026-10-01", "2026-10-30", CAL);
    expect(c).toEqual(["2026-10"]);
    expect(competenciasNoPeriodo(pro(), "2026-10-01", "2026-12-29", CAL).length).toBeLessThanOrEqual(Math.ceil(90 / 28) + 1);
  });

  it("vencimento antes de hoje no mês corrente ainda entra (o gerador pode ter falhado)", () => {
    expect(competenciasNoPeriodo(pro(), "2026-10-10", "2026-11-08", CAL)).toEqual(["2026-11"]);
    expect(competenciasNoPeriodo(pro({ diaVencimento: 20 }), "2026-10-10", "2026-11-08", CAL)).toEqual(["2026-10"]);
  });

  it("respeita início, fim e inativo", () => {
    expect(competenciasNoPeriodo(pro({ competenciaInicio: "2026-12" }), "2026-10-01", "2026-10-30", CAL)).toEqual([]);
    expect(competenciasNoPeriodo(pro({ competenciaFim: "2026-09" }), "2026-10-01", "2026-10-30", CAL)).toEqual([]);
    expect(competenciasNoPeriodo(pro({ ativo: false }), "2026-10-01", "2026-10-30", CAL)).toEqual([]);
  });
});

describe("eventosProgramados", () => {
  const o = { calendario: CAL, hoje: "2026-10-01", fim: "2026-10-30", vinculadas: new Set<string>() };

  it("vira despesa com a competência no nome, prioridade e caixinha do compromisso", () => {
    const [e] = eventosProgramados([pro({ caixinhaId: "cx" })], o);
    expect(e).toMatchObject({
      id: "prog:c1:2026-10",
      origem: "programado",
      tipo: "despesa",
      valor: reais(6_000),
      data: "2026-10-05",
      descricao: "Pró-labore · out/2026",
      favorecido: "Ana",
      prioridade: "p2",
      caixinhaId: "cx",
      naoProgramavel: MOTIVO_PROGRAMADO,
      status: null,
    });
  });

  it("mês com lançamento vinculado não é projetado (§9)", () => {
    expect(eventosProgramados([pro()], { ...o, calendario: CAL, vinculadas: new Set([idDoProgramado("c1", "2026-10")]) })).toEqual([]);
  });

  it("mês do mês corrente já vencido sem lançamento vai para Vencidos (§12)", () => {
    // Hoje 20/10 e vencimento dia 5: outubro já passou e não virou lançamento — o gerador não rodou.
    const es = eventosProgramados([pro()], { calendario: CAL, hoje: "2026-10-20", fim: "2026-11-18", vinculadas: new Set() });
    expect(es.map((e) => [e.data, e.vencido])).toEqual([
      ["2026-10-05", true],
      ["2026-11-05", false],
    ]);
    // Mais atrás que o mês corrente é trabalho do gerador, não da projeção.
    const so = eventosProgramados([pro()], { calendario: CAL, hoje: "2026-10-20", fim: "2026-10-30", vinculadas: new Set() });
    expect(so.map((e) => e.data)).toEqual(["2026-10-05"]);
  });

  it("sem prioridade no cadastro, o mês programado é P3; valor zero não vira evento", () => {
    expect(eventosProgramados([pro({ prioridade: null })], o)[0].prioridade).toBe("p3");
    expect(eventosProgramados([pro({ valor: 0 })], o)).toEqual([]);
  });
});

describe("competenciasAGerar (idempotência vem do par único; aqui é a antecedência)", () => {
  const vazio = new Set<string>();

  it("gera só o que está a menos de `antecedenciaDias` do vencimento", () => {
    // antecedência 5 e vencimento 05/10: nasce em 30/09, não antes.
    const novo = pro({ competenciaInicio: "2026-10" });
    expect(competenciasAGerar(novo, { calendario: CAL, hoje: "2026-09-30", vinculadas: vazio, mesesParaTras: 1 }).map((x) => x.competencia)).toEqual(["2026-10"]);
    expect(competenciasAGerar(novo, { calendario: CAL, hoje: "2026-09-29", vinculadas: vazio, mesesParaTras: 1 })).toEqual([]);
  });

  it("mês já vinculado nunca é gerado de novo", () => {
    const v = new Set([idDoProgramado("c1", "2026-10")]);
    expect(competenciasAGerar(pro(), { calendario: CAL, hoje: "2026-10-05", vinculadas: v, mesesParaTras: 0 })).toEqual([]);
  });

  it("vencido sem lançamento é gerado (o gerador perdeu o dia), mas não o histórico inteiro", () => {
    const comMuito = competenciasAGerar(pro(), { calendario: CAL, hoje: "2026-10-05", vinculadas: vazio, mesesParaTras: 2 });
    expect(comMuito.map((x) => x.competencia)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(competenciasAGerar(pro(), { calendario: CAL, hoje: "2026-10-05", vinculadas: vazio, mesesParaTras: 0 }).map((x) => x.competencia)).toEqual(["2026-10"]);
    // O padrão (12 meses) não volta antes do início da vigência.
    expect(competenciasAGerar(pro({ competenciaInicio: "2026-09" }), { calendario: CAL, hoje: "2026-10-05", vinculadas: vazio }).map((x) => x.competencia)).toEqual(["2026-09", "2026-10"]);
  });

  it("inativo, fora da vigência e valor zero não geram", () => {
    const o = { calendario: CAL, hoje: "2026-10-05", vinculadas: vazio, mesesParaTras: 0 };
    expect(competenciasAGerar(pro({ ativo: false }), o)).toEqual([]);
    expect(competenciasAGerar(pro({ competenciaFim: "2026-09" }), o)).toEqual([]);
    expect(competenciasAGerar(pro({ valor: 0 }), o)).toEqual([]);
  });
});

// As quatro linhas da tabela do §9.
describe("pró-labore recorrente × lançamento manual (§9)", () => {
  const base: LancamentoDaCompetencia = {
    id: "l1",
    descricao: "Pró-labore Ana",
    valor: reais(6_000),
    data: "2026-10-05",
    status: "previsto",
    categoriaId: "cat-prolabore",
    socioId: "s1",
    recorrenciaOrigemId: "c1",
    recorrenciaCompetencia: "2026-10",
  };
  const o = { calendario: CAL, hoje: "2026-10-01", fim: "2026-10-30" };

  it("6.000 com manual 6.000 vinculado: conta uma vez, nenhum aviso", () => {
    expect(avisoDoVinculo(pro(), base)).toBeNull();
    expect(avisosDeRecorrencia([pro()], [base], o)).toEqual([]);
    expect(eventosProgramados([pro()], { ...o, calendario: CAL, vinculadas: new Set([idDoProgramado("c1", "2026-10")]) })).toEqual([]);
  });

  it("6.000 com manual 5.000 vinculado: conta 5.000 e avisa R$ 1.000 abaixo", () => {
    const l = { ...base, valor: reais(5_000) };
    const [a] = avisosDeRecorrencia([pro()], [l], o);
    expect(a).toMatchObject({ tipo: "abaixo", diferenca: reais(1_000), lancamentoId: "l1", competencia: "2026-10" });
    expect(a.texto).toBe("Pró-labore de out/2026: R$ 1.000,00 abaixo da recorrência.");
  });

  it("6.000 com manual 8.000 vinculado: conta 8.000 e avisa R$ 2.000 acima", () => {
    const [a] = avisosDeRecorrencia([pro()], [{ ...base, valor: reais(8_000) }], o);
    expect(a).toMatchObject({ tipo: "acima", diferenca: reais(2_000) });
    expect(a.texto).toContain("R$ 2.000,00 acima da recorrência");
  });

  it("manual SEM vínculo: os dois contam e o aviso diz 'em dobro' com o mês", () => {
    const solto = { ...base, recorrenciaOrigemId: null, recorrenciaCompetencia: null };
    const [a] = avisosDeRecorrencia([pro()], [solto], o);
    expect(a).toMatchObject({ tipo: "dobro", compromissoId: "c1", competencia: "2026-10", lancamentoId: "l1" });
    expect(a.texto).toContain("em dobro em out/2026");
    // de propósito: sem vínculo o mês continua projetado, então a saída é superestimada.
    expect(eventosProgramados([pro()], { ...o, calendario: CAL, vinculadas: new Set() })).toHaveLength(1);
  });

  it("sem vínculo mas de outro sócio ou outra categoria: sem aviso e sem candidato", () => {
    const solto = { ...base, recorrenciaOrigemId: null, recorrenciaCompetencia: null };
    expect(avisosDeRecorrencia([pro()], [{ ...solto, socioId: "s2" }], o)).toEqual([]);
    expect(avisosDeRecorrencia([pro()], [{ ...solto, categoriaId: "outra" }], o)).toEqual([]);
    expect(candidatosDeVinculo([pro()], { ...solto, socioId: "s2" }, new Set())).toEqual([]);
  });

  it("lançamento cancelado não gera aviso", () => {
    expect(avisosDeRecorrencia([pro()], [{ ...base, valor: reais(5_000), status: "cancelado" }], o)).toEqual([]);
  });

  it("candidatos: um só quando bate categoria, sócio e competência vigente", () => {
    const solto = { ...base, recorrenciaOrigemId: null, recorrenciaCompetencia: null };
    const c = candidatosDeVinculo([pro(), pro({ id: "c2", socioId: "s2" })], solto, new Set());
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ competencia: "2026-10" });
    expect(c[0].compromisso.id).toBe("c1");
    // competência já vinculada a outro lançamento sai da lista
    expect(candidatosDeVinculo([pro()], solto, new Set([idDoProgramado("c1", "2026-10")]))).toEqual([]);
  });
});

describe("vencimento por dia útil e no mês seguinte (N0: folha CLT)", () => {
  // Novembro/2026: dia 1º é domingo e 2/11 (Finados) é feriado.
  const COM_FINADOS = criarCalendario({ feriados: ["2026-11-02"] });
  const folha = (p: Partial<CompromissoRecorrenteEntrada> = {}) =>
    pro({ id: "folha", descricao: "Folha CLT", socioId: null, categoriaId: "cat-folha", diaVencimento: 5, regraVencimento: "dia_util", mesesAteVencimento: 1, ...p });

  it("5º dia útil pula fim de semana e feriado", () => {
    expect(enesimoDiaUtil("2026-11", 5, CAL)).toBe("2026-11-06");
    expect(enesimoDiaUtil("2026-11", 5, COM_FINADOS)).toBe("2026-11-09");
    expect(enesimoDiaUtil("2026-10", 1, CAL)).toBe("2026-10-01");
  });

  it("N maior que os dias úteis do mês fica no último dia útil, nunca no mês seguinte", () => {
    expect(enesimoDiaUtil("2026-02", 30, CAL)).toBe("2026-02-27");
  });

  it("a folha de outubro vence no 5º dia útil de novembro", () => {
    expect(vencimentoDoCompromisso(folha(), "2026-10", COM_FINADOS)).toBe("2026-11-09");
    expect(competenciaDoVencimento(folha(), "2026-11-09")).toBe("2026-10");
    expect(descreverVencimento(folha())).toBe("5º dia útil do mês seguinte");
    expect(descreverVencimento(pro())).toBe("dia 5");
  });

  it("no horizonte de novembro aparece a folha de OUTUBRO (competência), não a de novembro", () => {
    expect(competenciasNoPeriodo(folha(), "2026-11-01", "2026-11-30", COM_FINADOS)).toEqual(["2026-10"]);
    const [e] = eventosProgramados([folha()], { calendario: COM_FINADOS, hoje: "2026-11-01", fim: "2026-11-30", vinculadas: new Set() });
    expect(e.id).toBe(idDoProgramado("folha", "2026-10"));
    expect(e.data).toBe("2026-11-09");
    expect(e.descricao).toContain("out/2026");
  });

  it("gera a folha de outubro alguns dias antes do 5º dia útil de novembro", () => {
    const o = { calendario: COM_FINADOS, vinculadas: new Set<string>(), mesesParaTras: 0 };
    expect(competenciasAGerar(folha({ antecedenciaDias: 5 }), { ...o, hoje: "2026-11-03" })).toEqual([]);
    expect(competenciasAGerar(folha({ antecedenciaDias: 5 }), { ...o, hoje: "2026-11-04", mesesParaTras: 1 })).toEqual([
      { competencia: "2026-10", vencimento: "2026-11-09" },
    ]);
  });

  it("lançamento manual pago em novembro é candidato à folha de OUTUBRO", () => {
    const l = { data: "2026-11-09", categoriaId: "cat-folha", socioId: null, recorrenciaOrigemId: null };
    expect(candidatosDeVinculo([folha()], l, new Set()).map((x) => x.competencia)).toEqual(["2026-10"]);
  });

  it("adiantamento é outra conta da MESMA competência, no próprio mês", () => {
    const adiant = folha({ id: "adiant", descricao: "Adiantamento salarial", regraVencimento: "dia_fixo", diaVencimento: 20, mesesAteVencimento: 0, adiantamento: true });
    expect(vencimentoDoCompromisso(adiant, "2026-10", CAL)).toBe("2026-10-20");
    expect(vencimentoDoCompromisso(folha(), "2026-10", CAL)).toBe("2026-11-06");
  });
});
