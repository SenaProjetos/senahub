import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { middleware } from "./middleware";

/**
 * Regressão do ERR_TOO_MANY_REDIRECTS. O middleware só enxerga a PRESENÇA do cookie de sessão,
 * nunca a validade. Se ele mandasse /login → / por causa do cookie, uma sessão que não vale no
 * banco (expirada, revogada, ou cookie de outro dev server em localhost, que não distingue porta)
 * entraria em laço com o requireUser, que manda de / para /login.
 */

const COOKIE = "better-auth.session_token=qualquer-valor.assinatura";

function pedir(caminho: string, cookie?: string) {
  return middleware(
    new NextRequest(`http://localhost:3001${caminho}`, { headers: cookie ? { cookie } : {} }),
  );
}

describe("middleware de sessão", () => {
  it("/login com cookie NÃO redireciona (a página valida a sessão de verdade)", () => {
    const res = pedir("/login", COOKIE);
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).toBe(200);
  });

  it("rota protegida sem cookie vai para /login guardando o destino", () => {
    const res = pedir("/tarefas");
    expect(res.status).toBe(307);
    const destino = new URL(res.headers.get("location")!);
    expect(destino.pathname).toBe("/login");
    expect(destino.searchParams.get("from")).toBe("/tarefas");
  });

  it("rota protegida com cookie passa (a checagem real é do requireUser)", () => {
    const res = pedir("/tarefas", COOKIE);
    expect(res.headers.get("location")).toBeNull();
  });

  it("rota pública passa sem cookie", () => {
    expect(pedir("/login").headers.get("location")).toBeNull();
    expect(pedir("/recuperar-senha").headers.get("location")).toBeNull();
  });
});

// Cookie de localhost não distingue porta: sem prefixo próprio, o cookie de um worktree valia como
// sessão no outro. Com AUTH_COOKIE_PREFIX cada servidor só reconhece o seu.
describe("middleware com AUTH_COOKIE_PREFIX", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reconhece o cookie do próprio prefixo", () => {
    vi.stubEnv("AUTH_COOKIE_PREFIX", "senahub-vscode");
    const res = pedir("/tarefas", "senahub-vscode.session_token=valor.assinatura");
    expect(res.headers.get("location")).toBeNull();
  });

  it("NÃO reconhece o cookie de outro worktree (prefixo padrão) — pede login", () => {
    vi.stubEnv("AUTH_COOKIE_PREFIX", "senahub-vscode");
    const res = pedir("/tarefas", COOKIE);
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("sem a variável, continua reconhecendo o cookie padrão (produção não muda)", () => {
    vi.stubEnv("AUTH_COOKIE_PREFIX", "");
    expect(pedir("/tarefas", COOKIE).headers.get("location")).toBeNull();
  });
});
