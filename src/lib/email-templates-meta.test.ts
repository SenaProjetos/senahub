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
});
