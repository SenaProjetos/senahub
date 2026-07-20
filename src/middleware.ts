import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Rotas públicas (não exigem sessão).
// "/p","/api/p" = inputs do cliente; "/a","/api/t" = proposta pública + pixel; "/api/health" = monitoramento.
const PUBLIC_PATHS = ["/login", "/sem-permissao", "/recuperar-senha", "/solicitar-cadastro", "/p", "/api/p", "/a", "/api/t", "/api/health"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = getSessionCookie(req);
  // server.ts roda um HTTP server customizado (não "next start"), então
  // req.nextUrl.origin reflete o hostname/porta internos do bind (ex.:
  // localhost:3000), não o domínio público por trás do Cloudflare Tunnel.
  // APP_URL é a origem pública correta em todo ambiente (dev e produção).
  const base = process.env.APP_URL || req.nextUrl.origin;

  // Verificação otimista por cookie. A checagem real (perfil, mustChangePassword,
  // ativo) ocorre nos Server Components via requireUser/requireRole.
  if (!isPublic(pathname) && !hasSession) {
    const url = new URL("/login", base);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  // Usuário logado tentando abrir /login → manda pra home.
  if (pathname === "/login" && hasSession) {
    return NextResponse.redirect(new URL("/", base));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Tudo exceto assets estáticos, imagens, a API de auth e as rotas de upload.
    //
    // Rotas de upload (api/uploads, api/documentos, api/chat/anexo) ficam FORA do
    // middleware de propósito: o Next 15.5 bufferiza o body em memória quando a rota
    // passa pelo middleware, com teto de 10 MB (middlewareClientMaxBodySize) — bodies
    // maiores são truncados e o multipart quebra ("expected boundary after body").
    // Envios diretos chegam a 70 MB e chunks a 45 MB (lib/upload-grande.ts), então
    // excluir do matcher evita o truncamento E o custo de RAM por request.
    // ATENÇÃO: toda rota sob esses prefixos DEVE se auto-autenticar (getSession +
    // mustChangePassword + ativo) — não há mais checagem otimista de cookie aqui.
    "/((?!api/auth|api/uploads|api/documentos|api/chat/anexo|api/suporte/anexo|_next/static|_next/image|favicon.ico|MARCA|manifest.json|sw.js|robots.txt).*)",
  ],
};
