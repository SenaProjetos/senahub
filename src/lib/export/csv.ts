/**
 * Escritor de CSV pt-BR, puro. Extraído do inline de `api/rh/produtividade/export/route.ts`
 * (F4.6) pra não colar o mesmo separador/escape/BOM em cada rota de export nova — mesma
 * decisão de `autoMapearGenerico` na F4.4: extrair da 1ª duplicata, não da 3ª.
 *
 * Separador `;` (não `,`) porque o Excel pt-BR (vírgula decimal) só reconhece `;` como
 * separador de coluna sem o usuário precisar importar manualmente. BOM UTF-8 na frente pelo
 * mesmo motivo — sem ele, acento vira lixo ao abrir direto no Excel.
 */

const SEPARADOR = ";";

type Celula = string | number | boolean | null | undefined;

function escaparCelula(v: Celula): string {
  if (v == null) return "";
  const s = typeof v === "boolean" ? (v ? "sim" : "não") : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function linhaCsv(celulas: Celula[]): string {
  return celulas.map(escaparCelula).join(SEPARADOR);
}

/** Cabeçalho + linhas → texto CSV completo, com BOM. Pronto pro `body` de uma `NextResponse`. */
export function arquivoCsv(headers: string[], linhas: Celula[][]): string {
  const todas = [headers, ...linhas].map(linhaCsv);
  return "﻿" + todas.join("\r\n");
}

/** Headers padrão de download — mesmo par usado pelo export de produtividade. */
export function headersDownloadCsv(nomeArquivo: string): HeadersInit {
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
  };
}
