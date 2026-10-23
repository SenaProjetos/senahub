import { describe, expect, it } from "vitest";
import {
  impressaoDoPlano,
  planoDeRestauracao,
  semMudanca,
  type AtribuicaoFoto,
  type DependenciaFoto,
  type EstadoPlano,
  type LinhaFoto,
} from "./estado";

const linha = (id: string, parentId: string | null, extra: Record<string, unknown> = {}): LinhaFoto => ({
  id,
  parentId,
  ordem: 0,
  nome: id,
  disciplinaId: null,
  etapaId: null,
  tipoEap: "atv",
  duracaoDias: "2",
  tipoAtividadeId: null,
  sistemaId: null,
  localizacaoId: null,
  origemId: null,
  prioridade: "med",
  restricaoTipo: null,
  restricaoData: null,
  // fora do plano:
  progresso: 0,
  status: "nin",
  codigoEap: "1",
  inicioPrevisto: "2026-10-05T00:00:00.000Z",
  fimPrevisto: "2026-10-06T00:00:00.000Z",
  ...extra,
});
const dep = (id: string, tarefaId: string, predecessoraId: string, extra: Partial<DependenciaFoto> = {}): DependenciaFoto => ({
  id,
  tarefaId,
  predecessoraId,
  tipo: "fs",
  lagDias: "0",
  ...extra,
});
const atr = (id: string, tarefaId: string, extra: Partial<AtribuicaoFoto> = {}): AtribuicaoFoto => ({
  id,
  tarefaId,
  userId: "u1",
  papel: "pro",
  horasPrevistas: "8",
  principal: true,
  ...extra,
});
const estado = (extra: Partial<EstadoPlano> = {}): EstadoPlano => ({
  inicioProjeto: "2026-10-05",
  linhas: [],
  dependencias: [],
  atribuicoes: [],
  parcelas: [],
  baselineLinhas: [],
  ...extra,
});

describe("impressaoDoPlano", () => {
  const base = () => estado({ linhas: [linha("A", null), linha("B", "A")], dependencias: [dep("d1", "B", "A")], atribuicoes: [atr("t1", "A")] });

  it("é a mesma para os mesmos dados em outra ordem", () => {
    const e = base();
    const invertido = estado({ linhas: [...e.linhas].reverse(), dependencias: [...e.dependencias].reverse(), atribuicoes: [...e.atribuicoes].reverse() });
    expect(impressaoDoPlano(invertido)).toBe(impressaoDoPlano(e));
  });

  it("muda com campo do plano: nome, vínculo, horas, início do projeto", () => {
    const i = impressaoDoPlano(base());
    expect(impressaoDoPlano(estado({ ...base(), linhas: [linha("A", null, { nome: "Outro" }), linha("B", "A")] }))).not.toBe(i);
    expect(impressaoDoPlano(estado({ ...base(), dependencias: [dep("d1", "B", "A", { lagDias: "2" })] }))).not.toBe(i);
    expect(impressaoDoPlano(estado({ ...base(), atribuicoes: [atr("t1", "A", { horasPrevistas: "9" })] }))).not.toBe(i);
    expect(impressaoDoPlano(estado({ ...base(), inicioProjeto: "2026-10-12" }))).not.toBe(i);
  });

  it("não muda com campo fora do plano: progresso, status, código, datas previstas", () => {
    const i = impressaoDoPlano(base());
    const mexido = estado({
      ...base(),
      linhas: [linha("A", null, { progresso: 50, status: "and", codigoEap: "9", inicioPrevisto: "2027-01-01T00:00:00.000Z" }), linha("B", "A")],
    });
    expect(impressaoDoPlano(mexido)).toBe(i);
  });
});

describe("planoDeRestauracao", () => {
  it("sem diferença: nada a fazer", () => {
    const e = estado({ linhas: [linha("A", null)], dependencias: [], atribuicoes: [atr("t1", "A")] });
    expect(semMudanca(planoDeRestauracao(e, e))).toBe(true);
  });

  it("linha só na foto volta inteira, com o pai antes do filho", () => {
    const antes = estado({ linhas: [linha("B", "A", { progresso: 30 }), linha("A", null)] });
    const p = planoDeRestauracao(estado(), antes);
    expect(p.criarLinhas.map((l) => l.id)).toEqual(["A", "B"]);
    expect(p.criarLinhas[1].progresso).toBe(30);
  });

  it("linha só no atual é apagada, e a filha dela não é repetida (cascade)", () => {
    const atual = estado({ linhas: [linha("A", null), linha("B", "A"), linha("C", null)] });
    const p = planoDeRestauracao(atual, estado({ linhas: [linha("C", null)] }));
    expect(p.apagarLinhas).toEqual(["A"]);
  });

  it("atualiza só os campos do plano que diferem", () => {
    const atual = estado({ linhas: [linha("A", null, { nome: "Novo", ordem: 3, progresso: 90 })] });
    const antes = estado({ linhas: [linha("A", null, { nome: "Velho", ordem: 1, progresso: 10 })] });
    expect(planoDeRestauracao(atual, antes).atualizarLinhas).toEqual([{ id: "A", campos: { nome: "Velho", ordem: 1 } }]);
  });

  it("vínculos e pessoas: cria, apaga e atualiza; o que cairia por cascade não é apagado à parte", () => {
    const atual = estado({
      linhas: [linha("A", null), linha("B", "A"), linha("X", null)],
      dependencias: [dep("dx", "X", "A"), dep("d2", "B", "A", { lagDias: "3" })],
      atribuicoes: [atr("tb", "B", { horasPrevistas: "1" }), atr("tx", "X")],
    });
    const antes = estado({
      linhas: [linha("A", null), linha("B", "A")],
      dependencias: [dep("d1", "A", "B"), dep("d2", "B", "A", { lagDias: "0" })],
      atribuicoes: [atr("tb", "B", { horasPrevistas: "5" }), atr("ta", "A")],
    });
    const p = planoDeRestauracao(atual, antes);
    expect(p.apagarLinhas).toEqual(["X"]);
    expect(p.apagarDependencias).toEqual([]); // dx cai junto com X
    expect(p.criarDependencias.map((d) => d.id)).toEqual(["d1"]);
    expect(p.atualizarDependencias).toEqual([{ id: "d2", tipo: "fs", lagDias: "0" }]);
    expect(p.apagarAtribuicoes).toEqual([]); // tx cai junto com X
    expect(p.criarAtribuicoes.map((a) => a.id)).toEqual(["ta"]);
    expect(p.atualizarAtribuicoes).toEqual([{ id: "tb", campos: { horasPrevistas: "5" } }]);
  });

  it("parcela de contrato ligada na foto e solta hoje é religada; ligada a outro marco não é mexida", () => {
    const antes = estado({ parcelas: [{ id: "p1", marcoId: "K" }, { id: "p2", marcoId: "K" }] });
    const atual = estado({ parcelas: [{ id: "p1", marcoId: null }, { id: "p2", marcoId: "OUTRO" }] });
    expect(planoDeRestauracao(atual, antes).religarParcelas).toEqual([{ id: "p1", marcoId: "K" }]);
  });

  it("linha de baseline solta hoje volta a apontar para a linha", () => {
    const antes = estado({ baselineLinhas: [{ id: "b1", tarefaId: "A" }] });
    const atual = estado({ baselineLinhas: [{ id: "b1", tarefaId: null }] });
    expect(planoDeRestauracao(atual, antes).religarBaselineLinhas).toEqual([{ id: "b1", tarefaId: "A" }]);
  });

  it("início do projeto diferente entra no plano", () => {
    const p = planoDeRestauracao(estado({ inicioProjeto: "2026-10-12" }), estado({ inicioProjeto: "2026-10-05" }));
    expect(p.inicioProjeto).toEqual({ de: "2026-10-12", para: "2026-10-05" });
    expect(semMudanca(p)).toBe(false);
  });
});
