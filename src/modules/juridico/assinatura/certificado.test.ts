import { describe, expect, it } from "vitest";
import { montarCertificadoHtml, type DadosCertificado } from "./certificado";

function dados(over: Partial<DadosCertificado> = {}): DadosCertificado {
  return {
    documentoTitulo: "Contrato de Prestação de Serviços",
    versaoNumero: 2,
    arquivoNome: "contrato-v2.pdf",
    emitidoEm: new Date("2026-08-27T12:00:00.000Z"),
    verificacao: { integra: true },
    signatarios: [
      {
        nome: "José da Silva",
        origem: "interno",
        assinadoEm: new Date("2026-08-26T18:30:00.000Z"),
        ip: "203.0.113.10",
        userAgent: "Mozilla/5.0",
        hashArquivo: "a".repeat(64),
      },
    ],
    eventos: [
      {
        sequencia: 1,
        tipo: "assinado",
        ocorridoEm: new Date("2026-08-26T18:30:00.000Z"),
        atorNome: "José da Silva",
        ip: "203.0.113.10",
        hash: "b".repeat(64),
      },
    ],
    ...over,
  };
}

describe("montarCertificadoHtml", () => {
  it("traz signatário, data, IP e hash do arquivo", () => {
    const html = montarCertificadoHtml(dados());
    expect(html).toContain("José da Silva");
    expect(html).toContain("203.0.113.10");
    expect(html).toContain("a".repeat(64));
    expect(html).toContain("Usuário autenticado no sistema");
  });

  it("distingue assinatura interna de externa — a força probatória não é a mesma", () => {
    const html = montarCertificadoHtml(
      dados({
        signatarios: [
          {
            nome: "Maria Cliente",
            origem: "externo",
            documento: "123.456.789-00",
            assinadoEm: new Date("2026-08-26T18:30:00.000Z"),
            ip: null,
            userAgent: null,
            hashArquivo: "c".repeat(64),
          },
        ],
      }),
    );
    expect(html).toContain("Link de assinatura enviado por e-mail");
    expect(html).toContain("123.456.789-00");
  });

  it("declara a cadeia íntegra quando ela é", () => {
    expect(montarCertificadoHtml(dados())).toContain("Cadeia de eventos íntegra");
  });

  it("REGISTRA a inconsistência em vez de omitir — certificado que esconde não prova nada", () => {
    const html = montarCertificadoHtml(
      dados({ verificacao: { integra: false, sequencia: 2, motivo: "hash_invalido" } }),
    );
    expect(html).toContain("Cadeia inconsistente no evento 2");
    expect(html).toContain("hash_invalido");
    expect(html).not.toContain("Cadeia de eventos íntegra");
  });

  it("cita a base legal e NÃO promete inviolabilidade", () => {
    const html = montarCertificadoHtml(dados());
    expect(html).toContain("2.200-2/2001");
    // A honestidade sobre o limite da cadeia é parte do documento, não uma nota interna.
    expect(html).toContain("não torna o registro inalterável");
  });

  it("escapa conteúdo — título com < não pode quebrar o certificado", () => {
    const html = montarCertificadoHtml(dados({ documentoTitulo: "Contrato <PJ> & Cia" }));
    expect(html).toContain("Contrato &lt;PJ&gt; &amp; Cia");
    expect(html).not.toContain("<PJ>");
  });

  it("aguenta documento sem assinatura ainda", () => {
    const html = montarCertificadoHtml(dados({ signatarios: [], eventos: [] }));
    expect(html).toContain("Nenhuma assinatura registrada");
    expect(html).toContain("Nenhum evento registrado");
  });
});
