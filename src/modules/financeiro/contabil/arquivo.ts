/**
 * Arquivos da exportação contábil — puro.
 *
 *  - `xlsx` / `csv` (genérico, mock: "uma linha por lançamento: data, conta de débito, conta de crédito, valor,
 *    histórico e documento"): leva também chave da NF-e, centro de custo e subcentro. Conta sem de-para sai em branco.
 *  - `alterdata` (C5, "layout do contador"): o modelo de importação que o contador mandou
 *    (`docs/financeiro/contabil/modelo-de-importacao-alterdata-lancamentos.xls`, 2026-10-13) tem SÓ 5 colunas — `debito`, `credito`, `data`,
 *    `valor`, `complemento historico`. Débito e crédito são o código REDUZIDO e nunca podem ficar em branco (o Alterdata
 *    recusaria a linha); documento e chave da NF-e viajam dentro do complemento do histórico; centro de custo e
 *    projeto NÃO têm coluna nesse modelo e ficam de fora.
 */
import type { LinhaContabil } from "@/modules/financeiro/contabil/partidas";

/** `alterdata` = o layout do contador; os outros dois são o arquivo genérico. */
export const FORMATOS_CONTABIL = ["xlsx", "csv", "alterdata"] as const;
export type FormatoContabil = (typeof FORMATOS_CONTABIL)[number];

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

/** Cabeçalho do modelo do contador, exatamente como está na planilha dele (minúsculo, sem acento). */
export const CABECALHO_ALTERDATA = ["debito", "credito", "data", "valor", "complemento historico"] as const;
/** Nome da aba no modelo do contador. */
export const ABA_ALTERDATA = "Planilha1";

/** Linhas em que débito ou crédito ficou sem conta (falta de-para ou o contador ainda não criou a conta). */
export const linhasSemConta = (linhas: readonly Pick<LinhaContabil, "debito" | "credito">[]): number => linhas.filter((l) => l.debito == null || l.credito == null).length;

export const MOTIVO_ALTERDATA_SEM_CONTA = (n: number) =>
  `${n} ${n === 1 ? "linha está" : "linhas estão"} sem conta contábil. O layout do contador não aceita conta em branco: preencha o de-para (ou peça ao contador a conta que falta) antes de exportar.`;

/** Histórico + documento + chave da NF-e: o modelo não tem coluna para os dois últimos. */
export function complementoAlterdata(l: Pick<LinhaContabil, "historico" | "documento" | "chaveNfe">): string {
  return [l.historico, l.documento ? `Doc. ${l.documento}` : null, l.chaveNfe ? `Chave ${l.chaveNfe}` : null].filter(Boolean).join(" - ");
}

export type LinhaDoAlterdata = [debito: number, credito: number, data: Date, valor: number, complemento: string];

/** `YYYY-MM-DD` → meia-noite UTC: o Excel guarda data sem fuso, então o dia não anda com o fuso do servidor. */
const dataUtc = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
};

/**
 * Linhas do modelo do contador (sem o cabeçalho). Recusa linha sem conta: não adivinha, não manda em branco.
 * É a última salvaguarda: quem barra ao usuário, com a mesma frase, é `registrarExportacaoNoBanco` (ActionError) e a rota (409).
 */
export function linhasDoAlterdata(linhas: readonly LinhaContabil[]): LinhaDoAlterdata[] {
  const faltam = linhasSemConta(linhas);
  if (faltam > 0) throw new Error(MOTIVO_ALTERDATA_SEM_CONTA(faltam));
  return linhas.map((l) => [l.debito as number, l.credito as number, dataUtc(l.data), l.valorCentavos / 100, complementoAlterdata(l)]);
}

