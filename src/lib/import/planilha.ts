import "server-only";
import { createRequire } from "node:module";
import { parseCsv } from "@/lib/import/csv";

const require = createRequire(import.meta.url);
// exceljs é CommonJS — evita problema de default export no Turbopack (mesmo padrão do export DRE).
const ExcelJS = require("exceljs") as typeof import("exceljs");

export const IMPORT_TAMANHO_MAX = 20 * 1024 * 1024; // 20 MB

export type PlanilhaLida = {
  sheets: string[];
  headers: string[];
  rows: string[][];
};

function celulaTexto(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) {
    // ExcelJS devolve Date para células de data; mantém dd/mm/aaaa (UTC) p/ a normalização BR.
    const d = String(v.getUTCDate()).padStart(2, "0");
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    return `${d}/${m}/${v.getUTCFullYear()}`;
  }
  if (typeof v === "object") {
    const o = v as { text?: unknown; result?: unknown; richText?: { text?: string }[] };
    if (typeof o.text === "string") return o.text;
    if (typeof o.result === "string" || typeof o.result === "number") return String(o.result);
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text ?? "").join("");
  }
  return String(v);
}

async function lerXlsx(buffer: Buffer): Promise<PlanilhaLida> {
  const wb = new ExcelJS.Workbook();
  // Buffer do Node é aceito pelo ExcelJS apesar da tipagem pedir ArrayBuffer.
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  const sheets = wb.worksheets.map((w) => w.name);
  // 1ª worksheet com pelo menos 2 linhas (cabeçalho + dados).
  const ws = wb.worksheets.find((w) => w.rowCount >= 2) ?? wb.worksheets[0];
  if (!ws) return { sheets, headers: [], rows: [] };

  const matriz: string[][] = [];
  ws.eachRow((row) => {
    const valores = Array.isArray(row.values) ? row.values.slice(1) : []; // índice 0 é vazio no ExcelJS
    matriz.push(valores.map(celulaTexto));
  });

  const naoVazias = matriz.filter((l) => l.some((c) => c.trim() !== ""));
  const headers = (naoVazias[0] ?? []).map((h) => h.trim());
  const rows = naoVazias.slice(1);
  return { sheets, headers, rows };
}

function lerCsv(buffer: Buffer): PlanilhaLida {
  const matriz = parseCsv(buffer.toString("utf8"));
  const headers = (matriz[0] ?? []).map((h) => h.trim());
  const rows = matriz.slice(1);
  return { sheets: ["CSV"], headers, rows };
}

/** Lê um buffer de planilha (.xlsx/.xls via ExcelJS, .csv/.txt via parser próprio). */
export async function lerPlanilha(buffer: Buffer, nomeArquivo: string): Promise<PlanilhaLida> {
  if (buffer.length > IMPORT_TAMANHO_MAX) {
    throw new Error("Arquivo grande demais (máx. 20 MB).");
  }
  const ext = nomeArquivo.toLowerCase().split(".").pop() ?? "";
  if (ext === "xlsx" || ext === "xls") return lerXlsx(buffer);
  if (ext === "csv" || ext === "txt") return lerCsv(buffer);
  throw new Error("Formato não suportado. Use .xlsx ou .csv.");
}
