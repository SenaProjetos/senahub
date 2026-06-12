import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Rotas públicas (não exigem sessão).
// "/p","/api/p" = inputs do cliente; "/a","/api/t" = proposta pública + pixel.
const PUBLIC_PATHS = ["/login", "/sem-permissao", "/recuperar-senha", "/p", "/api/p", "/a", "/api/t"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = getSessionCookie(req);

  // Verificação otimista por cookie. A checagem real (perfil, mustChangePassword,
  // ativo) ocorre nos Server Components via requireUser/requireRole.
  if (!isPublic(pathname) && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  // Usuário logado tentando abrir /login → manda pra home.
  if (pathname === "/login" && hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Tudo exceto assets estáticos, imagens e a API de auth.
    "/((?!api/auth|_next/static|_next/image|favicon.ico|MARCA|manifest.json|sw.js|robots.txt).*)",
  ],
};
