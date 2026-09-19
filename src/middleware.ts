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

  // NÃO redirecionar /login → / só porque existe cookie. O cookie prova presença, não validade:
  // se a sessão não vale no banco (expirada, revogada, banco recriado, ou cookie de OUTRO servidor
  // — cookie de localhost não distingue porta, então dois dev servers se sobrescrevem), o
  // requireUser manda para /login e este redirect mandaria de volta pra /, num laço até o
  // navegador desistir (ERR_TOO_MANY_REDIRECTS). Quem já tem sessão VÁLIDA é levado à home pela
  // própria página de login, que valida de verdade (src/app/(auth)/login/page.tsx).
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Tudo exceto assets estáticos, imagens e a API inteira.
    //
    // `/api` fica FORA do middleware por completo. Dois motivos:
    //
    // 1. Correção: o Next 15.5 bufferiza o body em memória quando a rota passa pelo
    //    middleware, com teto de 10 MB (middlewareClientMaxBodySize). Bodies maiores
    //    são truncados e o multipart quebra com "expected boundary after body" — 500 de
    //    corpo vazio. Antes só alguns prefixos de upload eram excluídos, e toda rota
    //    multipart nova caía nessa armadilha (foi o que derrubou /api/engenharia/normas).
    // 2. Segurança: aqui só se verifica a PRESENÇA do cookie (getSessionCookie), nunca a
    //    validade. Toda rota de API já chama getSession/requireUser/requirePermission ou
    //    valida um token público, o que é estritamente mais forte. Tirar o middleware do
    //    caminho não afrouxa nada — só economiza RAM por request.
    //
    // Exceções por desenho, que continuam sem sessão: /api/health (monitoramento) e
    // /api/auth/** (handler do better-auth).
    //
    // ATENÇÃO: rota de API nova DEVE se auto-autenticar — não há checagem de cookie aqui.
    // `MARCA` e `icons` ficam de fora junto com `manifest.json`: são assets de marca servidos
    // a quem não tem sessão. O crawler de prévia de link (WhatsApp/Telegram/Slack) busca o
    // og:image (`/MARCA/og-image.png`) numa segunda requisição SEM cookie — dentro do matcher
    // levaria redirect pro /login e o card sairia sem imagem. `icons` = ícones do manifest.json.
    "/((?!api/|_next/static|_next/image|favicon.ico|MARCA|icons|manifest.json|sw.js|robots.txt).*)",
  ],
};
