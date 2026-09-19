import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

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
