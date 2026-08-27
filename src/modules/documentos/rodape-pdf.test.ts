import { describe, expect, it } from "vitest";
import { FAIXA_RODAPE, FOOTER_PAGINACAO, reservarFaixaDoRodape } from "./rodape-pdf";

/**
 * O defeito que estes testes protegem foi medido, não imaginado: com o `@page { margin: 0 }` do
 * `globals.css` vencendo o `margin` do `page.pdf()`, o rodapé nativo saía a −1.3pt do texto (ou
 * seja, por cima dele) em todo modelo com `numerarPaginas` ligado — inclusive nos 4 modelos de
 * contrato de fábrica. Depois da correção, +33.5pt de folga.
 *
 * A verificação de geometria em si exige Chrome e não cabe no vitest; o que dá para blindar aqui
 * é o INVARIANTE que faz a correção funcionar.
 */
describe("reservarFaixaDoRodape", () => {
  it("injeta @page com a MESMA faixa que a rota passa ao page.pdf()", async () => {
    // Os dois valores precisam concordar: o `@page` abre a faixa, o `margin.bottom` posiciona o
    // rodapé dentro dela. Divergiram = rodapé fora da área reservada.
    let css = "";
    await reservarFaixaDoRodape({ addStyleTag: async (o: { content: string }) => { css = o.content; } } as never);
    expect(css).toContain(FAIXA_RODAPE);
  });

  it("mantém o !important — sem ele o @page do globals.css volta a vencer", () => {
    // Não é ordem de cascata: as duas regras têm a mesma especificidade, e a do globals está em
    // `@media print`. Remover o `!important` reintroduz a sobreposição silenciosamente.
    let css = "";
    void reservarFaixaDoRodape({ addStyleTag: async (o: { content: string }) => { css = o.content; } } as never);
    expect(css).toContain("!important");
  });

  it("zera as outras margens — só a inferior é reservada (o resto segue full-bleed)", async () => {
    let css = "";
    await reservarFaixaDoRodape({ addStyleTag: async (o: { content: string }) => { css = o.content; } } as never);
    expect(css).toMatch(/margin:\s*0\s+0\s+14mm\s+0/);
  });
});

describe("FOOTER_PAGINACAO", () => {
  it("usa as classes especiais do Chrome — são o único jeito de ter X/Y reais por página", () => {
    // `[Pagina]`/`[Paginas]` no corpo resolvem 1/1 (counter(pages) do CSS só vale no margin-box
    // do @page). Trocar estas classes por token do motor quebraria a numeração de novo.
    expect(FOOTER_PAGINACAO).toContain('class="pageNumber"');
    expect(FOOTER_PAGINACAO).toContain('class="totalPages"');
  });
});
