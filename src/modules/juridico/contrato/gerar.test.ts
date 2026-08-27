import { describe, expect, it } from "vitest";
import { escaparHtml, montarHtml } from "./gerar";

describe("escaparHtml", () => {
  it("neutraliza os caracteres que virariam markup", () => {
    expect(escaparHtml('a & b < c > d "e"')).toBe("a &amp; b &lt; c &gt; d &quot;e&quot;");
  });

  it("escapa & antes dos outros, para não gerar entidade dupla", () => {
    // Se `<` virasse `&lt;` ANTES de o `&` ser escapado, o resultado seria `&amp;lt;`.
    expect(escaparHtml("<")).toBe("&lt;");
  });
});

describe("montarHtml", () => {
  it("quebra em parágrafos por linha em branco e mantém quebra simples como <br />", () => {
    const html = montarHtml("Contrato", "Cláusula 1\nsegue aqui\n\nCláusula 2");
    expect(html).toContain("<p>Cláusula 1<br />segue aqui</p>");
    expect(html).toContain("<p>Cláusula 2</p>");
  });

  it("escapa o conteúdo JÁ RESOLVIDO — razão social com & não pode quebrar o documento", () => {
    // O caso real: o token virou "Silva & Filhos LTDA" e esse texto entra no HTML.
    const html = montarHtml("Contrato", "Contratada: Silva & Filhos LTDA");
    expect(html).toContain("Silva &amp; Filhos LTDA");
    expect(html).not.toContain("Silva & Filhos");
  });

  it("escapa o título também", () => {
    expect(montarHtml("Contrato <PJ>", "corpo")).toContain("<title>Contrato &lt;PJ&gt;</title>");
  });

  it("descarta blocos vazios em vez de gerar <p></p>", () => {
    expect(montarHtml("T", "um\n\n\n\ndois")).not.toContain("<p></p>");
  });
});
