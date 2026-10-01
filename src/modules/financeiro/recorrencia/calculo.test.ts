import { describe, expect, it } from "vitest";
import {
  avisoDoVinculo,
  avisosDeRecorrencia,
  candidatosDeVinculo,
  competenciaDe,
  competenciasAGerar,
  competenciasNoPeriodo,
  daProgramado,
  eventosProgramados,
  idDoProgramado,
  MOTIVO_PROGRAMADO,
  proximaCompetencia,
  rotuloDaCompetencia,
  vencimentoDa,
  type CompromissoRecorrenteEntrada,
  type LancamentoDaCompetencia,
} from "@/modules/financeiro/recorrencia/calculo";
import { reais } from "@/modules/financeiro/liquidez/fixtures";

const pro = (p: Partial<CompromissoRecorrenteEntrada> = {}): CompromissoRecorrenteEntrada => ({
  id: "c1",
  descricao: "Pró-labore",
  valor: reais(6_000),
  diaVencimento: 5,
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
    const c = competenciasNoPeriodo(pro(), "2026-10-01", "2026-10-30");
    expect(c).toEqual(["2026-10"]);
    expect(competenciasNoPeriodo(pro(), "2026-10-01", "2026-12-29").length).toBeLessThanOrEqual(Math.ceil(90 / 28) + 1);
  });

  it("vencimento antes de hoje no mês corrente ainda entra (o gerador pode ter falhado)", () => {
    expect(competenciasNoPeriodo(pro(), "2026-10-10", "2026-11-08")).toEqual(["2026-11"]);
    expect(competenciasNoPeriodo(pro({ diaVencimento: 20 }), "2026-10-10", "2026-11-08")).toEqual(["2026-10"]);
  });

  it("respeita início, fim e inativo", () => {
    expect(competenciasNoPeriodo(pro({ competenciaInicio: "2026-12" }), "2026-10-01", "2026-10-30")).toEqual([]);
    expect(competenciasNoPeriodo(pro({ competenciaFim: "2026-09" }), "2026-10-01", "2026-10-30")).toEqual([]);
    expect(competenciasNoPeriodo(pro({ ativo: false }), "2026-10-01", "2026-10-30")).toEqual([]);
  });
});

describe("eventosProgramados", () => {
  const o = { hoje: "2026-10-01", fim: "2026-10-30", vinculadas: new Set<string>() };

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
    expect(eventosProgramados([pro()], { ...o, vinculadas: new Set([idDoProgramado("c1", "2026-10")]) })).toEqual([]);
  });

  it("mês do mês corrente já vencido sem lançamento vai para Vencidos (§12)", () => {
    // Hoje 20/10 e vencimento dia 5: outubro já passou e não virou lançamento — o gerador não rodou.
    const es = eventosProgramados([pro()], { hoje: "2026-10-20", fim: "2026-11-18", vinculadas: new Set() });
    expect(es.map((e) => [e.data, e.vencido])).toEqual([
      ["2026-10-05", true],
      ["2026-11-05", false],
    ]);
    // Mais atrás que o mês corrente é trabalho do gerador, não da projeção.
    const so = eventosProgramados([pro()], { hoje: "2026-10-20", fim: "2026-10-30", vinculadas: new Set() });
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
    expect(competenciasAGerar(novo, { hoje: "2026-09-30", vinculadas: vazio, mesesParaTras: 1 }).map((x) => x.competencia)).toEqual(["2026-10"]);
    expect(competenciasAGerar(novo, { hoje: "2026-09-29", vinculadas: vazio, mesesParaTras: 1 })).toEqual([]);
  });

  it("mês já vinculado nunca é gerado de novo", () => {
    const v = new Set([idDoProgramado("c1", "2026-10")]);
    expect(competenciasAGerar(pro(), { hoje: "2026-10-05", vinculadas: v, mesesParaTras: 0 })).toEqual([]);
  });

  it("vencido sem lançamento é gerado (o gerador perdeu o dia), mas não o histórico inteiro", () => {
    const comMuito = competenciasAGerar(pro(), { hoje: "2026-10-05", vinculadas: vazio, mesesParaTras: 2 });
    expect(comMuito.map((x) => x.competencia)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(competenciasAGerar(pro(), { hoje: "2026-10-05", vinculadas: vazio, mesesParaTras: 0 }).map((x) => x.competencia)).toEqual(["2026-10"]);
    // O padrão (12 meses) não volta antes do início da vigência.
    expect(competenciasAGerar(pro({ competenciaInicio: "2026-09" }), { hoje: "2026-10-05", vinculadas: vazio }).map((x) => x.competencia)).toEqual(["2026-09", "2026-10"]);
  });

  it("inativo, fora da vigência e valor zero não geram", () => {
    const o = { hoje: "2026-10-05", vinculadas: vazio, mesesParaTras: 0 };
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
  const o = { hoje: "2026-10-01", fim: "2026-10-30" };

  it("6.000 com manual 6.000 vinculado: conta uma vez, nenhum aviso", () => {
    expect(avisoDoVinculo(pro(), base)).toBeNull();
    expect(avisosDeRecorrencia([pro()], [base], o)).toEqual([]);
    expect(eventosProgramados([pro()], { ...o, vinculadas: new Set([idDoProgramado("c1", "2026-10")]) })).toEqual([]);
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
    expect(eventosProgramados([pro()], { ...o, vinculadas: new Set() })).toHaveLength(1);
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
