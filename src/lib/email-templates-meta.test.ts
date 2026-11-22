import { describe, it, expect } from "vitest";
import { metaTemplate } from "./email-templates-meta";

describe("modelos de e-mail do portal", () => {
  it("modelo do pedido do briefing existe com as variáveis do serviço", () => {
    const meta = metaTemplate("portal-briefing-pedido");
    expect(meta).toBeDefined();
    expect(meta?.grupo).toBe("Projetos");
    expect(meta?.variaveis.map((v) => v.nome)).toEqual(["nome", "projeto", "url", "acao"]);
    expect(meta?.assuntoPadrao).toBe("A equipe {{acao}} o briefing do projeto {{projeto}}");
  });

  it("modelo do pedido de assinatura de contrato existe com as variáveis do serviço", () => {
    const meta = metaTemplate("portal-contrato-assinatura");
    expect(meta).toBeDefined();
    expect(meta?.grupo).toBe("Projetos");
    expect(meta?.variaveis.map((v) => v.nome)).toEqual(["nome", "documento", "projeto", "url"]);
    expect(meta?.assuntoPadrao).toBe("Assinatura pendente: {{documento}}");
    expect(meta?.corpoPadrao).toContain("{{url}}");
  });

  it.each(["portal-mensagem-equipe", "portal-mensagem-cliente"])(
    "modelo de mensagem nova da conversa (%s) existe com as variáveis do aviso e sem o texto da mensagem",
    (slug) => {
      const meta = metaTemplate(slug);
      expect(meta).toBeDefined();
      expect(meta?.grupo).toBe("Projetos");
      expect(meta?.variaveis.map((v) => v.nome)).toEqual(["nome", "projeto", "autor", "url"]);
      expect(meta?.corpoPadrao).toContain("{{url}}");
      expect(meta?.corpoPadrao).not.toMatch(/\{\{(texto|mensagem)\}\}/);
    },
  );
});
