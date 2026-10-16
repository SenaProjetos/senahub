/**
 * Arquivos da exportação contábil — puro.
 *
 * Conta no arquivo = a CLASSIFICAÇÃO do plano do contador ("1.1.1.02.0004"), por resposta dele em 2026-10-15. O código reduzido
 * (3941) é só a chave interna do SenaHub: a classificação se repete no plano real, então ela pode ser ambígua (ver
 * `linhasComContaRepetida`) e o layout do contador recusa o mês enquanto houver conta assim.
 *
 *  - `xlsx` / `csv` (genérico, mock: "uma linha por lançamento: data, conta de débito, conta de crédito, valor,
 *    histórico e documento"): leva também chave da NF-e, centro de custo e subcentro. Conta sem de-para sai em branco.
 *  - `alterdata` (C5, "layout do contador"): o modelo de importação que o contador mandou
 *    (`docs/financeiro/contabil/modelo-de-importacao-alterdata-lancamentos.xls`, 2026-10-13) tem 5 colunas — `debito`, `credito`, `data`,
 *    `valor`, `complemento historico`. Conta nunca em branco (o Alterdata recusaria a linha). O complemento tem no máximo 200
 *    caracteres (resposta do contador) e leva histórico + documento. Por decisão do dono (2026-10-15) vão em colunas extras à
 *    direita das 5: `centro de custo`, `projeto` e `chave de acesso` (a chave da NF-e, 44 dígitos, em texto).
 */
import type { LinhaContabil } from "@/modules/financeiro/contabil/partidas";

/** `alterdata` = o layout do contador; os outros dois são o arquivo genérico. */
export const FORMATOS_CONTABIL = ["xlsx", "csv", "alterdata"] as const;
export type FormatoContabil = (typeof FORMATOS_CONTABIL)[number];

/** A linha do motor (contas em código reduzido) + a classificação de cada conta, resolvida no plano do contador. */
export type LinhaExportada = LinhaContabil & { debitoClassificacao: string | null; creditoClassificacao: string | null };

export const CABECALHO_ARQUIVO = ["Data", "Débito", "Crédito", "Valor", "Histórico", "Documento", "Chave NF-e", "Centro de custo", "Subcentro (projeto)"] as const;

export type CelulaDoArquivo = string | number | null;

const dataBr = (iso: string) => iso.split("-").reverse().join("/");

/** Linhas do arquivo genérico, sem o cabeçalho. Valor em reais (número) para o Excel somar. */
export function linhasDoArquivo(linhas: readonly LinhaExportada[]): CelulaDoArquivo[][] {
  return linhas.map((l) => [dataBr(l.data), l.debitoClassificacao, l.creditoClassificacao, l.valorCentavos / 100, l.historico, l.documento, l.chaveNfe, l.centro, l.subcentro]);
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

const BOM = "﻿";

/** CSV com `;` e vírgula decimal (o que o Excel brasileiro abre direto), com BOM para manter os acentos. */
export function csvDoArquivo(linhas: readonly LinhaExportada[]): string {
  const corpo = linhas.map((l) =>
    [dataBr(l.data), l.debitoClassificacao, l.creditoClassificacao, valorCsv(l.valorCentavos), l.historico, l.documento, l.chaveNfe, l.centro, l.subcentro].map((v, i) => (i === 3 ? v : campoCsv(v as CelulaDoArquivo))).join(";"),
  );
  return `${BOM}${[CABECALHO_ARQUIVO.join(";"), ...corpo].join("\r\n")}\r\n`;
}

/** As 5 colunas do modelo do contador, exatamente como estão na planilha dele (minúsculo, sem acento). */
export const CABECALHO_MODELO_ALTERDATA = ["debito", "credito", "data", "valor", "complemento historico"] as const;
/** Colunas extras à direita do modelo (decisão do dono): centro de custo, projeto e a chave de acesso da NF-e. */
export const CABECALHO_EXTRA_ALTERDATA = ["centro de custo", "projeto", "chave de acesso"] as const;
export const CABECALHO_ALTERDATA = [...CABECALHO_MODELO_ALTERDATA, ...CABECALHO_EXTRA_ALTERDATA] as const;
/** Nome da aba no modelo do contador. */
export const ABA_ALTERDATA = "Planilha1";
/** Tamanho máximo do complemento do histórico na importação (resposta do contador). */
export const LIMITE_COMPLEMENTO_ALTERDATA = 200;

type ComContas = Pick<LinhaExportada, "debito" | "credito" | "debitoClassificacao" | "creditoClassificacao">;

/** Linhas em que débito ou crédito ficou sem conta (falta de-para, o contador ainda não criou a conta, ou ela saiu do plano). */
export const linhasSemConta = (linhas: readonly ComContas[]): number =>
  linhas.filter((l) => l.debito == null || l.credito == null || !l.debitoClassificacao || !l.creditoClassificacao).length;

export const MOTIVO_ALTERDATA_SEM_CONTA = (n: number) =>
  `${n} ${n === 1 ? "linha está" : "linhas estão"} sem conta contábil. O layout do contador não aceita conta em branco: preencha o de-para (ou peça ao contador a conta que falta) antes de exportar.`;

/** Linhas cuja conta tem classificação que mais de uma conta do plano usa: o Alterdata não saberia qual é. */
export const linhasComContaRepetida = (linhas: readonly Pick<LinhaExportada, "debitoClassificacao" | "creditoClassificacao">[], repetidas: ReadonlySet<string>): number =>
  linhas.filter((l) => (l.debitoClassificacao && repetidas.has(l.debitoClassificacao)) || (l.creditoClassificacao && repetidas.has(l.creditoClassificacao))).length;

export const MOTIVO_ALTERDATA_CONTA_REPETIDA = (n: number, classificacoes: readonly string[]) =>
  `${n} ${n === 1 ? "linha usa" : "linhas usam"} conta cuja classificação (${classificacoes.join(", ")}) se repete no plano do contador. Como o arquivo leva a classificação, o Alterdata não saberia qual conta é: escolha outra conta no de-para ou peça ao contador para corrigir o plano.`;

const DOC = (l: Pick<LinhaContabil, "documento">) => (l.documento ? ` - Doc. ${l.documento}` : "");

/**
 * Histórico + documento, em até 200 caracteres (o limite do contador). Passou do limite, a DESCRIÇÃO é encurtada ("…") e o
 * documento fica: ele é o que identifica a nota. A chave da NF-e tem coluna própria.
 */
export function complementoAlterdata(l: Pick<LinhaContabil, "historico" | "documento">): string {
  const doc = DOC(l);
  const cabe = LIMITE_COMPLEMENTO_ALTERDATA - doc.length;
  if (l.historico.length <= cabe) return l.historico + doc;
  return ((cabe > 1 ? `${l.historico.slice(0, cabe - 1)}…` : "") + doc).slice(0, LIMITE_COMPLEMENTO_ALTERDATA);
}

/** Quantas linhas têm complemento encurtado: a tela avisa, para ninguém descobrir só no Alterdata. */
export const complementosCortados = (linhas: readonly Pick<LinhaContabil, "historico" | "documento">[]): number =>
  linhas.filter((l) => l.historico.length + DOC(l).length > LIMITE_COMPLEMENTO_ALTERDATA).length;

export type LinhaDoAlterdata = [
  debito: string,
  credito: string,
  data: Date,
  valor: number,
  complemento: string,
  centroDeCusto: string | null,
  projeto: string | null,
  chaveDeAcesso: string | null,
];

/** `YYYY-MM-DD` → meia-noite UTC: o Excel guarda data sem fuso, então o dia não anda com o fuso do servidor. */
const dataUtc = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
};

/**
 * Linhas do modelo do contador (sem o cabeçalho). Recusa linha sem conta: não adivinha, não manda em branco.
 * É a última salvaguarda: quem barra ao usuário, com a mesma frase, é `registrarExportacaoNoBanco` (ActionError) e a rota (409).
 */
export function linhasDoAlterdata(linhas: readonly LinhaExportada[]): LinhaDoAlterdata[] {
  const faltam = linhasSemConta(linhas);
  if (faltam > 0) throw new Error(MOTIVO_ALTERDATA_SEM_CONTA(faltam));
  return linhas.map((l) => [l.debitoClassificacao as string, l.creditoClassificacao as string, dataUtc(l.data), l.valorCentavos / 100, complementoAlterdata(l), l.centro, l.subcentro, l.chaveNfe]);
}
