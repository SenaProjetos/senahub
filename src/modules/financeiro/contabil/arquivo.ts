/**
 * Arquivo genérico da exportação contábil (mock: "uma linha por lançamento: data, conta de débito, conta de
 * crédito, valor, histórico e documento") — puro. O layout próprio do Alterdata entra na fase C5, quando o
 * contador mandar o arquivo de exemplo. Contas pelo código reduzido; conta sem de-para sai em branco.
 */
import type { LinhaContabil } from "@/modules/financeiro/contabil/partidas";

export const CABECALHO_ARQUIVO = ["Data", "Débito", "Crédito", "Valor", "Histórico", "Documento", "Chave NF-e", "Centro de custo", "Subcentro (projeto)"] as const;

export type CelulaDoArquivo = string | number | null;

const dataBr = (iso: string) => iso.split("-").reverse().join("/");

/** Linhas do arquivo, sem o cabeçalho. Valor em reais (número) para o Excel somar. */
export function linhasDoArquivo(linhas: readonly LinhaContabil[]): CelulaDoArquivo[][] {
  return linhas.map((l) => [dataBr(l.data), l.debito, l.credito, l.valorCentavos / 100, l.historico, l.documento, l.chaveNfe, l.centro, l.subcentro]);
}

const campoCsv = (v: CelulaDoArquivo): string => {
  if (v == null) return "";
  const s = typeof v === "number" ? String(v) : v;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const valorCsv = (centavos: number) => {
  const sinal = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  return `${sinal}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
};

/** CSV com `;` e vírgula decimal (o que o Excel brasileiro abre direto), com BOM para manter os acentos. */
export function csvDoArquivo(linhas: readonly LinhaContabil[]): string {
  const corpo = linhas.map((l) =>
    [dataBr(l.data), l.debito, l.credito, valorCsv(l.valorCentavos), l.historico, l.documento, l.chaveNfe, l.centro, l.subcentro].map((v, i) => (i === 3 ? v : campoCsv(v as CelulaDoArquivo))).join(";"),
  );
  return `﻿${[CABECALHO_ARQUIVO.join(";"), ...corpo].join("\r\n")}\r\n`;
}
