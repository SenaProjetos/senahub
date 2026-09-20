import { describe, expect, it } from "vitest";

import {
  ACAO_COPIAR_USUARIO,
  ACAO_CREDENCIAL,
  ACAO_PORTAL,
  itensDeAcesso,
  urlDoPortal,
} from "./acoes";

const achar = (itens: { id: string }[], id: string) => itens.find((i) => i.id === id);

describe("urlDoPortal", () => {
  it("aceita http e https", () => {
    expect(urlDoPortal("https://gov.br/login")).toBe("https://gov.br/login");
    expect(urlDoPortal("http://intranet/x")).toBe("http://intranet/x");
  });

  it("recusa esquemas que executam código ou não são endereço", () => {
    expect(urlDoPortal("javascript:alert(1)")).toBeNull();
    expect(urlDoPortal("data:text/html,<b>x</b>")).toBeNull();
    expect(urlDoPortal("portal sem esquema")).toBeNull();
    expect(urlDoPortal("")).toBeNull();
    expect(urlDoPortal(null)).toBeNull();
  });
});

describe("itensDeAcesso", () => {
  it("com portal, credencial e login, oferece todos", () => {
    const itens = itensDeAcesso({ url: "https://gov.br", usuario: "sena" }, { podeRevelar: true });
    expect(achar(itens, ACAO_PORTAL)).toMatchObject({ tipo: "link", href: "https://gov.br/", novaAba: true });
    expect(achar(itens, ACAO_CREDENCIAL)).toBeDefined();
    expect(achar(itens, ACAO_COPIAR_USUARIO)).toBeDefined();
  });

  // O servidor manda `usuario: null` a quem não pode ver a credencial daquele registro.
  it("sem permissão sobre a credencial, não há cópia de login nem 'Ver credencial'", () => {
    const itens = itensDeAcesso({ url: "https://gov.br", usuario: null }, { podeRevelar: false });
    expect(achar(itens, ACAO_COPIAR_USUARIO)).toBeUndefined();
    expect(achar(itens, ACAO_CREDENCIAL)).toBeUndefined();
  });

  it("portal com esquema perigoso não vira link", () => {
    const itens = itensDeAcesso({ url: "javascript:alert(1)", usuario: "sena" }, { podeRevelar: false });
    expect(achar(itens, ACAO_PORTAL)).toBeUndefined();
  });

  // Regra 4 da ADR-0002: só sobraria "Abrir detalhes", que o botão "Ver" já faz.
  it("linha que só teria 'Abrir detalhes' fica sem menu", () => {
    expect(itensDeAcesso({ url: null, usuario: null }, { podeRevelar: false })).toEqual([]);
  });

  it("nunca oferece copiar a senha", () => {
    const ids = itensDeAcesso({ url: "https://x.com", usuario: "u" }, { podeRevelar: true }).map((i) => i.id);
    expect(ids.some((id) => id.includes("senha"))).toBe(false);
  });
});
