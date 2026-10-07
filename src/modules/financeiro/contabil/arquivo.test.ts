import { describe, expect, it } from "vitest";
import { csvDoArquivo, linhasDoArquivo } from "@/modules/financeiro/contabil/arquivo";
import type { LinhaContabil } from "@/modules/financeiro/contabil/partidas";

const linha = (p: Partial<LinhaContabil> = {}): LinhaContabil => ({
  data: "2026-09-12",
  debito: 3941,
  credito: 4235,
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

describe("arquivo da exportação", () => {
  it("linhas para o Excel: data brasileira, reduzidos e valor em reais", () => {
    expect(linhasDoArquivo([linha()])).toEqual([["12/09/2026", 3941, 4235, 45000.05, "Recebimento: Parcela 1/3", "NF 3381", null, "01", "01.007"]]);
  });

  it("CSV com ; , vírgula decimal, BOM, campo com ; entre aspas e conta em branco vazia", () => {
    const csv = csvDoArquivo([linha({ debito: null, historico: 'Aluguel; sala "A"', documento: null, centro: null, subcentro: null, valorCentavos: 7_05 })]);
    expect(csv.startsWith("﻿Data;Débito;Crédito;Valor;")).toBe(true);
    expect(csv.split("\r\n")[1]).toBe('12/09/2026;;4235;7,05;"Aluguel; sala ""A""";;;;');
  });
});
