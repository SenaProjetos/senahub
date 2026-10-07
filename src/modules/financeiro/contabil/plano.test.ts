import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { lerPlanoCsv, planejarImportacao, rotuloDaConta, type ContaGravada } from "@/modules/financeiro/contabil/plano";

const CAB = "classificacao;reduzido;nome;tipo;natureza;centro_custo";

describe("lerPlanoCsv", () => {
  it("lê analíticas e sintéticas pelo cabeçalho, com acento e BOM", () => {
    const r = lerPlanoCsv(`﻿${CAB}\n1.1;1365;Ativo Circulante;S;D;N\n1.1.1.02.0004;3941;BANCO ITAÚ C/C;A;D;S\n`);
    expect(r.erros).toEqual([]);
    expect(r.contas).toEqual([
      { reduzido: 1365, classificacao: "1.1", nome: "Ativo Circulante", analitica: false, natureza: "D", aceitaCentroCusto: false },
      { reduzido: 3941, classificacao: "1.1.1.02.0004", nome: "BANCO ITAÚ C/C", analitica: true, natureza: "D", aceitaCentroCusto: true },
    ]);
  });

  it("aceita colunas em outra ordem e vírgula como separador", () => {
    const r = lerPlanoCsv("reduzido,nome,classificacao,natureza,tipo\n11,Caixa,1.1.1.01.0001,D,A");
    expect(r.contas[0]).toMatchObject({ reduzido: 11, classificacao: "1.1.1.01.0001", analitica: true, aceitaCentroCusto: false });
  });

  it("classificação repetida é normal; reduzido repetido é erro", () => {
    const r = lerPlanoCsv(`${CAB}\n2.1.3.01.0003;2177;PIS a Recolher;A;C;N\n2.1.3.01.0003;2184;COFINS a Recolher;A;C;N\n2.1.3.01.0009;2184;Outra;A;C;N`);
    expect(r.contas.map((c) => c.reduzido)).toEqual([2177, 2184]);
    expect(r.erros).toEqual([{ linha: 4, motivo: "Código reduzido 2184 repetido (já na linha 3)." }]);
  });

  it("recusa linha sem dados válidos e cabeçalho incompleto", () => {
    expect(lerPlanoCsv("nome;tipo\nX;A").erros[0].motivo).toMatch(/Faltam colunas/);
    const r = lerPlanoCsv(`${CAB}\n1;abc;X;A;D;N\n1;2;X;Z;D;N\n1;3;X;A;Q;N\n;4;X;A;D;N`);
    expect(r.erros.map((e) => e.linha)).toEqual([2, 3, 4, 5]);
  });

  it("o plano do contador versionado no repositório lê inteiro, sem erro", () => {
    const csv = readFileSync(path.resolve(__dirname, "../../../../docs/financeiro/contabil/plano-de-contas-gama-2026-10.csv"), "utf8");
    const r = lerPlanoCsv(csv);
    expect(r.erros).toEqual([]);
    expect(r.contas).toHaveLength(389);
    expect(r.contas.find((c) => c.reduzido === 3108)).toMatchObject({ nome: "Serviços Prestados - Mercado Interno", analitica: true });
  });
});

describe("planejarImportacao", () => {
  const conta = (reduzido: number, nome = `C${reduzido}`, ativa = true): ContaGravada => ({
    reduzido,
    classificacao: `1.${reduzido}`,
    nome,
    analitica: true,
    natureza: "D",
    aceitaCentroCusto: false,
    ativa,
  });

  it("cria as novas, altera as mudadas, desativa as que saíram e conta as iguais", () => {
    const { ativa: _a, ...semAtiva } = conta(3);
    void _a;
    const p = planejarImportacao([conta(1), conta(2), conta(3)], [{ ...conta(1), nome: "Novo nome" }, semAtiva, conta(4)]);
    expect(p.criar.map((c) => c.reduzido)).toEqual([4]);
    expect(p.alterar.map((c) => c.reduzido)).toEqual([1]);
    expect(p.desativar).toEqual([2]);
    expect(p.iguais).toBe(1);
  });

  it("conta inativa que volta ao plano é reativada", () => {
    const p = planejarImportacao([conta(5, "C5", false)], [conta(5)]);
    expect(p.alterar.map((c) => c.reduzido)).toEqual([5]);
    expect(p.desativar).toEqual([]);
  });
});

it("rotuloDaConta", () => {
  expect(rotuloDaConta({ classificacao: "1.1.1.01.0001", nome: "Caixa", reduzido: 11 })).toBe("1.1.1.01.0001 Caixa (11)");
});
