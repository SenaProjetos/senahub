import { describe, expect, it } from "vitest";

import { PREFIXO_COOKIE_PADRAO, prefixoDeCookieValido, prefixoDoCookie } from "./auth-cookie";

describe("prefixoDoCookie", () => {
  it("sem a variável, é o padrão do better-auth (produção não muda)", () => {
    expect(prefixoDoCookie(undefined)).toBe("better-auth");
    expect(prefixoDoCookie("")).toBe(PREFIXO_COOKIE_PADRAO);
    expect(prefixoDoCookie("   ")).toBe(PREFIXO_COOKIE_PADRAO);
  });

  it("usa o valor configurado, sem espaços nas pontas", () => {
    expect(prefixoDoCookie("senahub-vscode")).toBe("senahub-vscode");
    expect(prefixoDoCookie("  senahub_a1  ")).toBe("senahub_a1");
  });

  it("valor que não serve num nome de cookie cai no padrão, em vez de quebrar o login", () => {
    expect(prefixoDoCookie("com espaco")).toBe(PREFIXO_COOKIE_PADRAO);
    expect(prefixoDoCookie("com.ponto")).toBe(PREFIXO_COOKIE_PADRAO); // o ponto separa prefixo e nome
    expect(prefixoDoCookie("a;b")).toBe(PREFIXO_COOKIE_PADRAO);
    expect(prefixoDoCookie("x".repeat(41))).toBe(PREFIXO_COOKIE_PADRAO);
  });
});

describe("prefixoDeCookieValido", () => {
  it("aceita só letras, números, hífen e sublinhado", () => {
    expect(prefixoDeCookieValido("senahub-antigravity")).toBe(true);
    expect(prefixoDeCookieValido("dev_2")).toBe(true);
    expect(prefixoDeCookieValido("")).toBe(false);
    expect(prefixoDeCookieValido(undefined)).toBe(false);
    expect(prefixoDeCookieValido(null)).toBe(false);
    expect(prefixoDeCookieValido("a b")).toBe(false);
  });
});
