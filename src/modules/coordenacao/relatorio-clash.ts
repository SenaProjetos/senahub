/**
 * Coordenação BIM — monta o HTML do relatório de clashes (um item por conflito:
 * imagem do snapshot + elementos + profundidade). Puro (só template string, sem
 * DOM/canvas) — a captura de câmera/realce/snapshot roda no client (clash-painel.tsx),
 * que injeta as imagens já como data URI. Aberto numa aba nova; "Salvar como PDF" fica
 * a cargo do print-to-PDF nativo do navegador — sem puppeteer/dependência nova.
 */
export type ItemRelatorioClash = {
  numero: number;
  disciplinaA: string;
  disciplinaB: string;
  profundidade: string; // já formatado (formatarMetros)
  imagemDataUrl: string;
};

export type MetaRelatorioClash = {
  projetoCodigo: string;
  projetoNome: string;
  geradoEm: string; // já formatado (ex.: formatarDataHora)
};

function escaparHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Monta o documento HTML completo do relatório (auto-contido, sem CSS/JS externo). */
export function montarRelatorioClashHtml(itens: readonly ItemRelatorioClash[], meta: MetaRelatorioClash): string {
  const linhas = itens
    .map(
      (it) => `
    <section class="item">
      <h2>Conflito #${it.numero}</h2>
      <p class="meta">${escaparHtml(it.disciplinaA)} × ${escaparHtml(it.disciplinaB)} — penetração ${escaparHtml(it.profundidade)}</p>
      <img src="${it.imagemDataUrl}" alt="Conflito ${it.numero}" />
    </section>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Relatório de conflitos — ${escaparHtml(meta.projetoCodigo)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; color: #1a1a1a; }
  header { border-bottom: 2px solid #dc2626; padding-bottom: 1rem; margin-bottom: 1.5rem; }
  header h1 { margin: 0 0 0.25rem; font-size: 1.4rem; }
  header p { margin: 0; color: #555; font-size: 0.9rem; }
  .item { break-inside: avoid; page-break-inside: avoid; margin-bottom: 2rem; border: 1px solid #ddd; border-radius: 8px; padding: 1rem; }
  .item h2 { margin: 0 0 0.25rem; font-size: 1.1rem; color: #dc2626; }
  .item .meta { margin: 0 0 0.75rem; color: #444; font-size: 0.9rem; }
  .item img { max-width: 100%; border-radius: 4px; border: 1px solid #eee; }
  @media print { body { margin: 0.5cm; } .item { border: none; } }
</style>
</head>
<body>
<header>
  <h1>Relatório de conflitos de coordenação</h1>
  <p>${escaparHtml(meta.projetoCodigo)} — ${escaparHtml(meta.projetoNome)} · gerado em ${escaparHtml(meta.geradoEm)} · ${itens.length} conflito(s)</p>
</header>
${linhas || "<p>Nenhum conflito selecionado.</p>"}
</body>
</html>`;
}
