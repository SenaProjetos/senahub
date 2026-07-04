import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

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
  },
  session: {
    // Sessão de 16 horas (regra do sistema). Renovação deslizante: usuário
    // ativo não cai; só expira após 16h de inatividade.
    expiresIn: 60 * 60 * 16,
    updateAge: 60 * 60,
  },
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "cliente", input: false },
      ativo: { type: "boolean", required: false, defaultValue: true, input: false },
      mustChangePassword: { type: "boolean", required: false, defaultValue: false, input: false },
    },
  },
  databaseHooks: {
    session: {
      create: {
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
    database: { generateId: false },
    ...(process.env.NODE_ENV !== "production" ? { disableCSRFCheck: true } : {}),
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
