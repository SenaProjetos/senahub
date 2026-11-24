import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { prefixoDoCookie } from "@/lib/auth-cookie";
import { acessoBloqueado } from "@/modules/usuarios/vinculo/desligamento";
import { VALIDADE_LINK_SEG, ipDosCabecalhos } from "@/modules/auth/redefinir-senha";
import {
  aposRedefinirPeloLink,
  enviarLinkDeRedefinicao,
  ipDoContexto,
} from "@/modules/auth/redefinir-senha-service";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    // Cadastro é feito por admin (tela de usuários), não auto-serviço público.
    disableSignUp: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // "Esqueci minha senha": link por e-mail (modules/auth/redefinir-senha*). A senha só muda quando
    // o dono do e-mail abre o link; o reset pelo admin (senha temporária) continua para quem perdeu o e-mail.
    resetPasswordTokenExpiresIn: VALIDADE_LINK_SEG,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, token }, request) => {
      const ip = request ? ipDosCabecalhos(request.headers) : await ipDoContexto();
      // Sem `await`: quem existe e quem não existe respondem no mesmo tempo (o envio de e-mail
      // demora e denunciaria o cadastro). O serviço nunca lança.
      void enviarLinkDeRedefinicao({ userId: user.id, token, ip });
    },
    onPasswordReset: async ({ user }, request) => {
      await aposRedefinirPeloLink(user.id, request ? ipDosCabecalhos(request.headers) : await ipDoContexto());
    },
  },
  // Pedir link e gravar senha só pelas Server Actions (modules/auth/actions.ts), que têm a trava por
  // IP e a auditoria; pelo HTTP direto do better-auth essas rotas não existem. `auth.api` segue valendo.
  disabledPaths: ["/request-password-reset", "/reset-password", "/forget-password"],
  session: {
    // Sessão de 7 dias (uso mobile não pode exigir login diário). Renovação
    // deslizante: a cada 1h de atividade o expiresAt é reempurrado pra +7d;
    // usuário ativo não cai, só expira após 7 dias de inatividade.
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60,
  },
  user: {
    additionalFields: {
      ativo: { type: "boolean", required: false, defaultValue: true, input: false },
      mustChangePassword: { type: "boolean", required: false, defaultValue: false, input: false },
    },
  },
  databaseHooks: {
    session: {
      create: {
        // Senha certa não basta: usuário desativado ou com `acessoAte` vencido (desligamento) não
        // ganha sessão. Sem isto, desativar só derrubava as sessões abertas — o login seguinte
        // entrava de novo. `getSession` recusa as sessões já existentes pela mesma regra.
        before: async (session) => {
          const u = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { ativo: true, acessoAte: true },
          });
          if (!u || acessoBloqueado(u)) {
            await logAudit({
              userId: session.userId,
              modulo: "auth",
              acao: "login",
              tipo: "login",
              resultado: "bloqueado",
              ip: session.ipAddress || null,
            });
            throw new APIError("FORBIDDEN", {
              message: "Seu acesso ao sistema foi encerrado. Procure o RH.",
              code: "ACESSO_ENCERRADO",
            });
          }
        },
        after: async (session) => {
          // Registra cada login bem-sucedido (regra de auditoria).
          await logAudit({
            userId: session.userId,
            modulo: "auth",
            acao: "login",
            tipo: "login",
            resultado: "sucesso",
            ip: session.ipAddress || null,
          });
        },
      },
    },
  },
  // Trava anti-força-bruta embutida (por IP).
  rateLimit: {
    enabled: true,
    window: 60,
    max: 20,
    customRules: {
      "/sign-in/email": { window: 300, max: 10 },
    },
  },
  // Em produção, confia apenas na URL pública configurada. Em dev, o preview
  // usa portas dinâmicas (localhost:NNNNN), então liberamos a checagem de origem.
  trustedOrigins:
    process.env.NODE_ENV === "production"
      ? [process.env.BETTER_AUTH_URL!]
      : undefined,
  advanced: {
    // Nome do cookie de sessão por worktree (AUTH_COOKIE_PREFIX); sem a variável, o padrão do
    // better-auth. O middleware lê o mesmo valor por src/lib/auth-cookie.ts.
    cookiePrefix: prefixoDoCookie(),
    database: { generateId: false },
    ...(process.env.NODE_ENV !== "production" ? { disableCSRFCheck: true } : {}),
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
