import { describe, expect, it } from "vitest";
import { csvDoArquivo, linhasDoArquivo, type LinhaExportada } from "@/modules/financeiro/contabil/arquivo";

const linha = (p: Partial<LinhaExportada> = {}): LinhaExportada => ({
  data: "2026-09-12",
  debito: 3941,
  credito: 4235,
  debitoClassificacao: "1.1.1.02.0004",
  creditoClassificacao: "1.1.2.01.0080",
  valorCentavos: 45000_05,
  historico: "Recebimento: Parcela 1/3",
  documento: "NF 3381",
  chaveNfe: null,
  centro: "01",
  subcentro: "01.007",
  lancamentoId: "l1",
  evento: "baixa",
  ...p,
});

describe("arquivo genérico da exportação", () => {
  it("linhas para o Excel: data brasileira, CLASSIFICAÇÃO das contas e valor em reais", () => {
    expect(linhasDoArquivo([linha()])).toEqual([["12/09/2026", "1.1.1.02.0004", "1.1.2.01.0080", 45000.05, "Recebimento: Parcela 1/3", "NF 3381", null, "01", "01.007"]]);
  });

  it("CSV com ; , vírgula decimal, BOM, campo com ; entre aspas e conta em branco vazia", () => {
    const csv = csvDoArquivo([linha({ debitoClassificacao: null, historico: 'Aluguel; sala "A"', documento: null, centro: null, subcentro: null, valorCentavos: 7_05 })]);
    expect(csv.startsWith("﻿Data;Débito;Crédito;Valor;")).toBe(true);
    expect(csv.split("\r\n")[1]).toBe('12/09/2026;;1.1.2.01.0080;7,05;"Aluguel; sala ""A""";;;;');
  });
});
