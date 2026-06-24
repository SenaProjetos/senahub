/**
 * Renderer HTML da memória de cálculo (autocontido, A4, CSS inline).
 * Usado pelo PDF (puppeteer `setContent`) e por uma eventual prévia em tela. Puro, sem Next.
 */

import type { MemoriaDoc, MemoriaSecao, MemoriaValor } from "./types";

function esc(v: string | number): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dataBR(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function valorLinha(v: MemoriaValor): string {
  const sim = v.simbolo ? `<span class="sim">${esc(v.simbolo)}</span>` : "";
  const formula = v.formula ? ` = <span class="formula">${esc(v.formula)}</span>` : "";
  const subst = v.substituicao ? ` = <span class="subst">${esc(v.substituicao)}</span>` : "";
  const unidade = v.unidade ? ` <span class="un">${esc(v.unidade)}</span>` : "";
  return `<tr>
    <td class="desc">${esc(v.descricao)}${sim ? ` (${sim})` : ""}</td>
    <td class="val">${formula}${subst} = <strong>${esc(v.valor)}</strong>${unidade}</td>
  </tr>`;
}

function secaoHtml(s: MemoriaSecao): string {
  const paragrafos = (s.paragrafos ?? []).map((p) => `<p>${esc(p)}</p>`).join("");
  const valores =
    s.valores && s.valores.length > 0
      ? `<table class="valores">${s.valores.map(valorLinha).join("")}</table>`
      : "";
  const tabelas = (s.tabelas ?? [])
    .map(
      (t) => `
      ${t.titulo ? `<p class="tab-titulo">${esc(t.titulo)}</p>` : ""}
      <table class="dados">
        <thead><tr>${t.colunas.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
        <tbody>${t.linhas
          .map((l) => `<tr>${l.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody>
      </table>`,
    )
    .join("");
  const notas =
    s.notas && s.notas.length > 0
      ? `<ul class="notas">${s.notas.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`
      : "";
  return `<section><h2>${esc(s.titulo)}</h2>${paragrafos}${valores}${tabelas}${notas}</section>`;
}

export function renderMemoriaHtml(doc: MemoriaDoc): string {
  const meta = [
    doc.norma ? `Norma: ${esc(doc.norma)}` : "",
    doc.autor ? `Autor: ${esc(doc.autor)}` : "",
    doc.projeto ? `Projeto: ${esc(doc.projeto)}` : "",
    `Gerado em: ${esc(dataBR(doc.geradoEm))}`,
  ]
    .filter(Boolean)
    .join(" &nbsp;·&nbsp; ");

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1a1a1a; font-size: 11pt; line-height: 1.45; }
  header { border-bottom: 2px solid #2c3e50; padding-bottom: 8px; margin-bottom: 16px; }
  header h1 { font-size: 16pt; margin: 0 0 2px; color: #2c3e50; }
  header .sub { font-size: 11pt; color: #555; margin: 0; }
  header .meta { font-size: 9pt; color: #777; margin-top: 6px; }
  section { margin: 14px 0; page-break-inside: avoid; }
  h2 { font-size: 12pt; color: #2c3e50; border-bottom: 1px solid #ddd; padding-bottom: 3px; margin: 0 0 8px; }
  p { margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0; }
  table.valores td { padding: 3px 6px; vertical-align: top; }
  table.valores td.desc { width: 45%; color: #333; }
  table.valores td.val { font-family: "Consolas", monospace; font-size: 10pt; }
  .sim { font-style: italic; color: #2c3e50; }
  .formula, .subst { color: #666; }
  table.dados th, table.dados td { border: 1px solid #ccc; padding: 4px 6px; font-size: 10pt; text-align: left; }
  table.dados th { background: #f0f3f6; }
  .tab-titulo { font-weight: 600; margin: 8px 0 2px; }
  ul.notas { margin: 6px 0; padding-left: 18px; font-size: 10pt; color: #555; }
  footer { margin-top: 22px; border-top: 1px solid #ddd; padding-top: 8px; font-size: 8.5pt; color: #888; font-style: italic; }
</style></head>
<body>
  <header>
    <h1>${esc(doc.titulo)}</h1>
    ${doc.subtitulo ? `<p class="sub">${esc(doc.subtitulo)}</p>` : ""}
    <p class="meta">${meta}</p>
  </header>
  ${doc.secoes.map(secaoHtml).join("")}
  <footer>${esc(doc.disclaimer)}</footer>
</body></html>`;
}
