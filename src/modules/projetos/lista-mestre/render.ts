/**
 * Saídas da Lista Mestre: HTML (que vira PDF via puppeteer) e planilha. Puro — o timbrado e as
 * linhas chegam prontos; quem lê banco/storage é `service.ts`.
 */
import type ExcelJSType from "exceljs";
import { TIMBRADO_CSS, timbradoHtml, type EmpresaTimbrado } from "@/modules/configuracoes/empresa/timbrado";
import type { LinhaListaMestre } from "./montar";

export type CabecalhoListaMestre = {
  nomeArquivo: string;
  projetoCodigo: string;
  projetoNome: string;
  disciplinaNome: string;
  geradoEm: Date;
  geradoPor: string | null;
  /** Dígitos do número da folha na versão do padrão do projeto (v1 = 4, v2 = 3). */
  larguraNumero?: number;
};

const COLUNAS = [
  { chave: "numero", titulo: "Nº", largura: 8 },
  { chave: "documento", titulo: "Documento", largura: 34 },
  { chave: "titulo", titulo: "Título", largura: 46 },
  { chave: "fase", titulo: "Fase", largura: 7 },
  { chave: "tipo", titulo: "Tipo", largura: 7 },
  { chave: "folha", titulo: "Folha", largura: 7 },
  { chave: "revisao", titulo: "Rev.", largura: 7 },
  { chave: "formatos", titulo: "Formatos", largura: 14 },
  { chave: "atualizadoEm", titulo: "Atualizado", largura: 12 },
] as const;

function escapar(txt: string): string {
  return txt.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function data(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function celula(linha: LinhaListaMestre, chave: (typeof COLUNAS)[number]["chave"], larguraNumero: number): string {
  switch (chave) {
    case "numero":
      return linha.numero === null ? "" : String(linha.numero).padStart(larguraNumero, "0");
    case "formatos":
      return linha.formatos.join(", ");
    case "atualizadoEm":
      return data(linha.atualizadoEm);
    default:
      return linha[chave];
  }
}

export function renderListaMestreHtml(
  cab: CabecalhoListaMestre,
  linhas: LinhaListaMestre[],
  empresa: EmpresaTimbrado | null,
): string {
  const cabecalhoTabela = COLUNAS.map((c) => `<th>${c.titulo}</th>`).join("");
  const corpo = linhas
    .map((l) => `<tr>${COLUNAS.map((c) => `<td class="${c.chave}">${escapar(celula(l, c.chave, cab.larguraNumero ?? 4))}</td>`).join("")}</tr>`)
    .join("");
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${escapar(cab.nomeArquivo)}</title>
<style>
  ${TIMBRADO_CSS}
  body { font-family: Arial, Helvetica, sans-serif; color: #1c2b24; font-size: 10px; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  .sub { margin: 0 0 12px; color: #52645a; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid #1c2b24; padding: 4px; }
  td { border-bottom: 1px solid #dfe5dc; padding: 4px; vertical-align: top; }
  td.numero, td.fase, td.tipo, td.folha, td.revisao, td.documento { font-family: "Courier New", monospace; white-space: nowrap; }
  tr { page-break-inside: avoid; }
  .rodape { margin-top: 10px; color: #52645a; font-size: 9px; }
</style>
</head>
<body>
  ${timbradoHtml(empresa)}
  <h1>Lista Mestre — ${escapar(cab.disciplinaNome)}</h1>
  <p class="sub">${escapar(cab.projetoCodigo)} · ${escapar(cab.projetoNome)} · ${escapar(cab.nomeArquivo)}</p>
  <table>
    <thead><tr>${cabecalhoTabela}</tr></thead>
    <tbody>${corpo}</tbody>
  </table>
  <p class="rodape">
    ${linhas.length} documento(s) validado(s). Gerado em ${data(cab.geradoEm)}${cab.geradoPor ? ` por ${escapar(cab.geradoPor)}` : ""}.
  </p>
</body>
</html>`;
}

export function preencherPlanilhaListaMestre(
  workbook: ExcelJSType.Workbook,
  cab: CabecalhoListaMestre,
  linhas: LinhaListaMestre[],
): void {
  const ws = workbook.addWorksheet("Lista Mestre");
  ws.addRow([`Lista Mestre — ${cab.disciplinaNome}`]).font = { bold: true, size: 13 };
  ws.addRow([`${cab.projetoCodigo} · ${cab.projetoNome} · ${cab.nomeArquivo}`]);
  ws.addRow([`Gerado em ${data(cab.geradoEm)}${cab.geradoPor ? ` por ${cab.geradoPor}` : ""}`]);
  ws.addRow([]);
  const cabecalho = ws.addRow(COLUNAS.map((c) => c.titulo));
  cabecalho.font = { bold: true };
  COLUNAS.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.largura;
  });
  for (const l of linhas) ws.addRow(COLUNAS.map((c) => celula(l, c.chave, cab.larguraNumero ?? 4)));
  ws.views = [{ state: "frozen", ySplit: 5 }];
}
