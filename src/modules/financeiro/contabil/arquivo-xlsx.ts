import { createRequire } from "node:module";
import type { Workbook } from "exceljs";
import { ABA_ALTERDATA, CABECALHO_ALTERDATA, CABECALHO_ARQUIVO, linhasDoAlterdata, linhasDoArquivo } from "@/modules/financeiro/contabil/arquivo";
import type { LinhaExportada } from "@/modules/financeiro/contabil/arquivo";

const require = createRequire(import.meta.url);
// exceljs é CommonJS — evita problema de default export no Turbopack.
const ExcelJS = require("exceljs") as typeof import("exceljs");

/** Planilha genérica (mock "Exportação"): uma linha por partida, com documento, chave da NF-e, centro e subcentro. */
export function planilhaGenerica(linhas: readonly LinhaExportada[]): Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Lançamentos");
  ws.addRow([...CABECALHO_ARQUIVO]).font = { bold: true };
  for (const l of linhasDoArquivo(linhas)) ws.addRow(l);
  [12, 10, 10, 14, 56, 18, 46, 14, 18].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.getColumn(4).numFmt = "#,##0.00";
  return wb;
}

/**
 * Planilha no modelo de importação do contador (`modelo-de-importacao-alterdata-lancamentos.xls`): aba "Planilha1",
 * cabeçalho `debito | credito | data | valor | complemento historico` na linha 1 e uma partida por linha abaixo.
 * A data é data de verdade (dd/mm/aaaa) e o valor é número com duas casas — o mesmo que o modelo dele traz. Débito e crédito
 * são a CLASSIFICAÇÃO do plano dele (texto, "1.1.1.02.0004", resposta do contador em 2026-10-15); depois das 5
 * colunas dele vêm `centro de custo`, `projeto` e `chave de acesso` (decisão do dono, 2026-10-15). Conta e chave em formato Texto
 * para o Excel não virar número (44 dígitos viram notação científica). Sem negrito e sem totais.
 */
export function planilhaAlterdata(linhas: readonly LinhaExportada[]): Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(ABA_ALTERDATA);
  ws.addRow([...CABECALHO_ALTERDATA]);
  for (const l of linhasDoAlterdata(linhas)) ws.addRow(l);
  ws.getColumn(1).numFmt = "@";
  ws.getColumn(2).numFmt = "@";
  ws.getColumn(3).numFmt = "dd/mm/yyyy";
  ws.getColumn(4).numFmt = "0.00";
  ws.getColumn(8).numFmt = "@";
  [16, 16, 12, 14, 80, 22, 18, 48].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  return wb;
}
