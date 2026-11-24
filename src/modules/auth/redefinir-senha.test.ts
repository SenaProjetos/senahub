import { describe, expect, it } from "vitest";
import {
  MAX_LINKS_POR_PESSOA,
  decidirEnvio,
  ipDosCabecalhos,
  linkDeRedefinicao,
  primeiroNome,
  tokenBemFormado,
} from "./redefinir-senha";

describe("decidirEnvio", () => {
  it("acesso encerrado nunca recebe link, mesmo dentro das cotas", () => {
    expect(decidirEnvio({ bloqueado: true, cabeNaCotaDoIp: true, linksRecentes: 1 })).toBe("bloqueado");
  });

  it("cota do IP esgotada barra o envio", () => {
    expect(decidirEnvio({ bloqueado: false, cabeNaCotaDoIp: false, linksRecentes: 1 })).toBe("limite");
  });

  it("teto da pessoa conta o link recém-criado", () => {
    expect(decidirEnvio({ bloqueado: false, cabeNaCotaDoIp: true, linksRecentes: MAX_LINKS_POR_PESSOA })).toBe("enviar");
    expect(decidirEnvio({ bloqueado: false, cabeNaCotaDoIp: true, linksRecentes: MAX_LINKS_POR_PESSOA + 1 })).toBe(
      "limite",
    );
  });
});

describe("ipDosCabecalhos", () => {
  const h = (o: Record<string, string>) => new Headers(o);

  it("prefere o IP da Cloudflare ao x-forwarded-for, que o cliente controla", () => {
    expect(ipDosCabecalhos(h({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "9.9.9.9" }))).toBe("1.1.1.1");
  });

  it("cai no x-forwarded-for e no x-real-ip, cortando em 64", () => {
    expect(ipDosCabecalhos(h({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" }))).toBe("2.2.2.2");
    expect(ipDosCabecalhos(h({ "x-real-ip": "4.4.4.4" }))).toBe("4.4.4.4");
    expect(ipDosCabecalhos(h({ "x-forwarded-for": "a".repeat(200) }))).toHaveLength(64);
    expect(ipDosCabecalhos(h({}))).toBeNull();
  });
});

describe("tokenBemFormado", () => {
  it("aceita o formato do better-auth e recusa lixo", () => {
    expect(tokenBemFormado("aB3dE5fG7hJ9kL1mN3pQ5rS7")).toBe(true);
    expect(tokenBemFormado("")).toBe(false);
    expect(tokenBemFormado("curto")).toBe(false);
    expect(tokenBemFormado("abc'; drop table--xxxxxxxx")).toBe(false);
    expect(tokenBemFormado(undefined)).toBe(false);
    expect(tokenBemFormado(["aB3dE5fG7hJ9kL1mN3pQ5rS7"])).toBe(false);
  });
});

describe("linkDeRedefinicao", () => {
  it("monta o link na origem pública sem barra dobrada", () => {
    expect(linkDeRedefinicao("https://hub.exemplo.com/", "tok123")).toBe(
      "https://hub.exemplo.com/redefinir-senha?token=tok123",
    );
  });

  it("sem APP_URL absoluta não há link (sairia relativo e não abriria do e-mail)", () => {
    expect(linkDeRedefinicao(undefined, "tok")).toBeNull();
    expect(linkDeRedefinicao("", "tok")).toBeNull();
    expect(linkDeRedefinicao("hub.exemplo.com", "tok")).toBeNull();
  });
});

describe("primeiroNome", () => {
  it("pega o primeiro nome e tolera vazio", () => {
    expect(primeiroNome("  Maria  Souza ")).toBe("Maria");
    expect(primeiroNome(null)).toBe("");
  });
});
