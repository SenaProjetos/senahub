import { describe, expect, it } from "vitest";
import { escaparHtml } from "./gerar";

/**
 * `montarHtml` foi removida na Fase E6 junto com o pipeline de texto puro — os testes dela saíram
 * com a função. `escaparHtml` ficou: quem a usa é o certificado de conclusão da assinatura
 * (`assinatura/certificado.ts`), que monta o próprio HTML e não tinha nada a ver com aquele
 * pipeline.
 */
describe("escaparHtml", () => {
  it("neutraliza os caracteres que virariam markup", () => {
    expect(escaparHtml('a & b < c > d "e"')).toBe("a &amp; b &lt; c &gt; d &quot;e&quot;");
  });

  it("escapa & antes dos outros, para não gerar entidade dupla", () => {
    // Se `<` virasse `&lt;` ANTES de o `&` ser escapado, o resultado seria `&amp;lt;`.
    expect(escaparHtml("<")).toBe("&lt;");
  });
});
