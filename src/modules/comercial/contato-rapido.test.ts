import { describe, expect, it } from "vitest";
import { linkEmail, linkWhatsApp } from "./contato-rapido";

describe("linkWhatsApp", () => {
  it("normaliza celular brasileiro com pontuação", () => {
    expect(linkWhatsApp("(81) 99999-9999")).toBe("https://wa.me/5581999999999");
  });

  it("aceita fixo de 10 dígitos", () => {
    expect(linkWhatsApp("81 3333-4444")).toBe("https://wa.me/558133334444");
  });

  it("não duplica o DDI quando já vem com +55", () => {
    expect(linkWhatsApp("+55 81 99999-9999")).toBe("https://wa.me/5581999999999");
  });

  it("devolve null sem telefone — a UI usa isso para ESCONDER o botão", () => {
    // O aceite pede exatamente isso: contato sem telefone não mostra o botão, em vez de
    // mostrar um link que abriria o app numa conversa inexistente.
    expect(linkWhatsApp(null)).toBeNull();
    expect(linkWhatsApp(undefined)).toBeNull();
    expect(linkWhatsApp("")).toBeNull();
    expect(linkWhatsApp("   ")).toBeNull();
  });

  it("devolve null para número de tamanho impossível", () => {
    expect(linkWhatsApp("123")).toBeNull();
    expect(linkWhatsApp("999999999999999999")).toBeNull();
  });

  it("codifica a mensagem inicial", () => {
    const url = linkWhatsApp("81999999999", "Olá, tudo bem?");
    expect(url).toContain("?text=");
    expect(url).toContain(encodeURIComponent("Olá, tudo bem?"));
  });

  it("mensagem só de espaços não vira parâmetro vazio", () => {
    expect(linkWhatsApp("81999999999", "   ")).toBe("https://wa.me/5581999999999");
  });
});

describe("linkEmail", () => {
  it("monta mailto simples", () => {
    expect(linkEmail("contato@empresa.com.br")).toBe("mailto:contato@empresa.com.br");
  });

  it("ignora espaços em volta", () => {
    expect(linkEmail("  contato@empresa.com  ")).toBe("mailto:contato@empresa.com");
  });

  it("devolve null sem e-mail utilizável — botão escondido", () => {
    expect(linkEmail(null)).toBeNull();
    expect(linkEmail("")).toBeNull();
    expect(linkEmail("sem-arroba")).toBeNull();
    expect(linkEmail("a@b")).toBeNull(); // sem ponto no domínio
  });

  it("codifica o assunto", () => {
    const url = linkEmail("a@b.com", "Proposta — Edifício Aurora");
    expect(url).toContain("?subject=");
    expect(url).toContain(encodeURIComponent("Proposta — Edifício Aurora"));
  });
});
