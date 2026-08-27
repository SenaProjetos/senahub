import type { Page } from "puppeteer-core";

/**
 * Rodapé de paginação do PDF do Estúdio — compartilhado pelas duas rotas que geram PDF
 * (`api/documentos/[id]/pdf` = preview do modelo, `api/documentos/gerados/[id]/pdf` = documento
 * gerado). Ambas navegam para uma página real do Next com `page.goto`, então ambas carregam
 * `globals.css` e sofrem o mesmo problema descrito abaixo.
 *
 * ## Por que `reservarFaixaDoRodape` existe
 *
 * `globals.css` declara `@page { size: A4; margin: 0 }` dentro do `@media print` — regra correta
 * para o Ctrl+P de qualquer tela do sistema, onde o full-bleed é o desejado. Só que o `@page` do
 * CSS **vence o `margin` passado ao `page.pdf()`**: com a regra no lugar, o `margin.bottom` abaixo
 * é ignorado, nenhuma faixa é reservada, e o rodapé nativo do Chrome é desenhado POR CIMA da
 * última linha de texto de cada página.
 *
 * Medido no spike da Fase M2 (`docs/.../2026-08-27-contratos-no-estudio.md` §9): folga de
 * **−1.5pt** (sobreposição) contra **+37.5pt** depois da correção, num A4 de 2 páginas.
 *
 * A correção é deliberadamente local à rota, e não a remoção do `@page` do `globals.css`: aquela
 * regra vale para TODA impressão do sistema, e mexer nela para resolver um caso de PDF gerado no
 * servidor trocaria um defeito estreito por um amplo.
 *
 * ⚠️ O `!important` é o que faz a regra vencer — NÃO é ordem de cascata. `addStyleTag` injeta
 * depois, mas as duas regras têm a mesma especificidade e o `@page` do `globals.css` está dentro
 * de `@media print`, então sem o `!important` o resultado volta a ser sobreposição. Não remova.
 */

/** Altura da faixa reservada ao rodapé. Um valor só: o `@page` injetado e o `margin.bottom` do
 *  `page.pdf()` precisam concordar, senão o rodapé cai fora da faixa que ele mesmo abriu. */
export const FAIXA_RODAPE = "14mm";

export const FOOTER_PAGINACAO =
  '<div style="width:100%;font-size:9px;color:#666;text-align:center;padding:0 6mm;">' +
  'Página <span class="pageNumber"></span> / <span class="totalPages"></span>' +
  "</div>";

/** Abre a faixa do rodapé no `@page`, que é quem de fato manda na margem da página impressa. */
export async function reservarFaixaDoRodape(page: Page): Promise<void> {
  await page.addStyleTag({ content: `@page { margin: 0 0 ${FAIXA_RODAPE} 0 !important; }` });
}
