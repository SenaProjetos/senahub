import { describe, expect, it } from "vitest";
import { atividadeNaoIniciada, planejarEquipeNaBase, type LinhaDaBase, type LinhaDeHoje } from "./orcamento-base";

const base = (id: string, horas: number | null, custo: number | null, resumo = false): LinhaDaBase => ({
  id: `bl-${id}`,
  tarefaId: id,
  nome: id,
  resumo,
  trabalhoHoras: horas,
  custoPrevisto: custo,
});
const hoje = (
  id: string,
  parentId: string | null,
  horas: number | null,
  custo: number | null,
  o: { resumo?: boolean; naoIniciada?: boolean } = {},
): LinhaDeHoje => ({
  id,
  parentId,
  nome: id,
  ehResumo: o.resumo ?? false,
  naoIniciada: o.naoIniciada ?? true,
  trabalhoHoras: horas,
  custo,
});

describe("atividadeNaoIniciada", () => {
  it("não iniciada: sem início real, 0% e status de antes do começo", () => {
    expect(atividadeNaoIniciada({ status: "nin", progresso: 0, inicioReal: null })).toBe(true);
    expect(atividadeNaoIniciada({ status: "agu", progresso: 0, inicioReal: null })).toBe(true);
    expect(atividadeNaoIniciada({ status: "blq", progresso: 0, inicioReal: null })).toBe(true);
  });
  it("começou: início real (a 1ª hora de ponto grava), % ou status de andamento", () => {
    expect(atividadeNaoIniciada({ status: "nin", progresso: 0, inicioReal: new Date() })).toBe(false);
    expect(atividadeNaoIniciada({ status: "nin", progresso: 10, inicioReal: null })).toBe(false);
    expect(atividadeNaoIniciada({ status: "and", progresso: 0, inicioReal: null })).toBe(false);
  });
  it("fora do plano (suspensa, cancelada, arquivada) e concluída não entram", () => {
    for (const status of ["sus", "can", "arq", "con", "rev", "apr"]) {
      expect(atividadeNaoIniciada({ status, progresso: 0, inicioReal: null })).toBe(false);
    }
  });
});

describe("planejarEquipeNaBase", () => {
  // G (agrupamento) → A (não iniciada, ganhou uma pessoa), B (já começou, também ganhou)
  const linhasBase = [base("G", 80, 4000, true), base("A", 40, 2000), base("B", 40, 2000)];

  it("só a atividade não iniciada pega horas e custo de hoje; o agrupamento acompanha pela soma", () => {
    const r = planejarEquipeNaBase(linhasBase, [
      hoje("G", null, 160, 8000, { resumo: true }),
      hoje("A", "G", 80, 4000),
      hoje("B", "G", 80, 4000, { naoIniciada: false }),
    ]);
    expect(r.atividadesAtualizadas).toBe(1);
    expect(r.iniciadasDiferentes).toBe(1);
    expect(r.mudancas).toEqual([
      expect.objectContaining({ tarefaId: "G", resumo: true, antes: { horas: 80, custo: 4000 }, depois: { horas: 120, custo: 6000 } }),
      expect.objectContaining({ tarefaId: "A", resumo: false, antes: { horas: 40, custo: 2000 }, depois: { horas: 80, custo: 4000 } }),
    ]);
  });

  it("nada mudou: plano vazio (e o agrupamento não é reescrito)", () => {
    const r = planejarEquipeNaBase(linhasBase, [
      hoje("G", null, 80, 4000, { resumo: true }),
      hoje("A", "G", 40, 2000),
      hoje("B", "G", 40, 2000, { naoIniciada: false }),
    ]);
    expect(r.mudancas).toEqual([]);
    expect(r.atividadesAtualizadas).toBe(0);
  });

  it("atividade sem horas na aprovação (ninguém escalado) ganha as da pessoa que entrou", () => {
    const r = planejarEquipeNaBase(
      [base("G", null, null, true), base("A", null, null), base("B", 40, 2000)],
      [hoje("G", null, 80, 4000, { resumo: true }), hoje("A", "G", 40, 2000), hoje("B", "G", 40, 2000)],
    );
    expect(r.mudancas.find((m) => m.tarefaId === "A")?.depois).toEqual({ horas: 40, custo: 2000 });
    // O agrupamento deixa de ser desconhecido: agora todos os filhos têm estimativa.
    expect(r.mudancas.find((m) => m.tarefaId === "G")?.depois).toEqual({ horas: 80, custo: 4000 });
  });

  it("custo desconhecido hoje (pessoa sem custo/hora) não vira zero: a atividade e o agrupamento ficam sem custo", () => {
    const r = planejarEquipeNaBase(linhasBase, [
      hoje("G", null, 120, null, { resumo: true }),
      hoje("A", "G", 80, null),
      hoje("B", "G", 40, 2000, { naoIniciada: false }),
    ]);
    expect(r.mudancas.find((m) => m.tarefaId === "A")?.depois).toEqual({ horas: 80, custo: null });
    expect(r.mudancas.find((m) => m.tarefaId === "G")?.depois).toEqual({ horas: 120, custo: null });
  });

  it("só a taxa mudou (mesmas horas): não reabre o orçamento congelado", () => {
    const r = planejarEquipeNaBase(linhasBase, [
      hoje("G", null, 80, 4800, { resumo: true }),
      hoje("A", "G", 40, 2400),
      hoje("B", "G", 40, 2400, { naoIniciada: false }),
    ]);
    expect(r.mudancas).toEqual([]);
    expect(r.iniciadasDiferentes).toBe(0);
  });

  it("hoje sem estimativa (ninguém com hora) não apaga o número da linha de base", () => {
    const r = planejarEquipeNaBase(linhasBase, [
      hoje("G", null, null, null, { resumo: true }),
      hoje("A", "G", null, null),
      hoje("B", "G", 40, 2000, { naoIniciada: false }),
    ]);
    expect(r.mudancas).toEqual([]);
  });

  it("agrupamento dentro de agrupamento soma em cadeia, em centavos", () => {
    const r = planejarEquipeNaBase(
      [base("R", 10, 100.1, true), base("G", 10, 100.1, true), base("A", 10, 100.1)],
      [hoje("R", null, 0, 0, { resumo: true }), hoje("G", "R", 0, 0, { resumo: true }), hoje("A", "G", 10.333, 100.2)],
    );
    expect(r.mudancas.map((m) => [m.tarefaId, m.depois])).toEqual([
      ["R", { horas: 10.33, custo: 100.2 }],
      ["G", { horas: 10.33, custo: 100.2 }],
      ["A", { horas: 10.33, custo: 100.2 }],
    ]);
  });

  it("linha da base sem tarefa (excluída) ou atividade que sumiu de hoje fica como está", () => {
    const r = planejarEquipeNaBase(
      [{ ...base("X", 5, 50), tarefaId: null }, base("A", 40, 2000)],
      [],
    );
    expect(r.mudancas).toEqual([]);
  });

  it("filho de hoje sem linha na base deixa o agrupamento sem estimativa (não inventa número)", () => {
    const r = planejarEquipeNaBase(
      [base("G", 40, 2000, true), base("A", 40, 2000)],
      [hoje("G", null, 80, 4000, { resumo: true }), hoje("A", "G", 40, 2000), hoje("N", "G", 40, 2000)],
    );
    expect(r.mudancas).toEqual([expect.objectContaining({ tarefaId: "G", depois: { horas: null, custo: null } })]);
  });
});
