import "server-only";
import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { notificarAdmins } from "@/lib/notifications";
import { criarLimitador } from "@/lib/rate-limit";
import { enviarEmailTemplate, type TemplateVars } from "@/lib/email-templates";
import { acessoBloqueado } from "@/modules/usuarios/vinculo/desligamento";
import {
  JANELA_LIMITE_MS,
  MAX_GRAVACOES_POR_IP,
  MAX_LINKS_POR_PESSOA,
  MAX_LINKS_POR_PESSOA_E_IP,
  MAX_PEDIDOS_POR_IP,
  PREFIXO_TOKEN,
  VALIDADE_LINK_SEG,
  VALIDADE_LINK_TEXTO,
  decidirEnvio,
  ipDosCabecalhos,
  linkDeRedefinicao,
  MOTIVO_LINK_CONTA_INATIVA,
  MOTIVO_LINK_FALHOU,
  MOTIVO_LINK_MUITOS,
  MOTIVO_LINK_SEM_EMAIL_DO_SISTEMA,
  MOTIVO_LINK_SEM_ENDERECO,
  primeiroNome,
  tokenBemFormado,
  type DecisaoEnvio,
} from "./redefinir-senha";

/** Assinatura de `enviarEmailTemplate` — o smoke passa um falso para ler o link sem SMTP. */
export type EnviarEmailTemplate = (to: string, slug: string, vars: TemplateVars) => Promise<boolean>;

export type ResultadoEnvio = Exclude<DecisaoEnvio, "enviar"> | "enviado" | "falhou";

const TITULO_FALHA = "Link de nova senha não foi enviado";

// ── Travas em memória (síncronas, então atômicas no processo) ─────────────────────────────────
// Em globalThis pelo mesmo motivo de lib/rate-limit.ts: server.ts e o bundle do Next carregam
// este módulo separadamente no mesmo processo.

type Baldes = NonNullable<Parameters<typeof criarLimitador>[0]>;
type GlobalComLimite = typeof globalThis & { __senahubLimiteSenha?: Baldes };

function limitar(chave: string, maximo: number) {
  const g = globalThis as GlobalComLimite;
  g.__senahubLimiteSenha ??= new Map() as Baldes;
  return criarLimitador(g.__senahubLimiteSenha)({ chave, maximo, janelaMs: JANELA_LIMITE_MS });
}

/** Pedido de link pela tela de login: conta por IP (qualquer e-mail). */
export function limitarPedidoPorIp(ip: string | null) {
  return limitar(`redefinir-senha:pedido:${ip ?? "sem-ip"}`, MAX_PEDIDOS_POR_IP);
}

/** Tentativa de gravar a senha pelo link: conta por IP. */
export function limitarGravacaoPorIp(ip: string | null) {
  return limitar(`redefinir-senha:gravar:${ip ?? "sem-ip"}`, MAX_GRAVACOES_POR_IP);
}

/** IP da requisição em curso (Server Action); fora de uma requisição (script), `null`. */
export async function ipDoContexto(): Promise<string | null> {
  try {
    return ipDosCabecalhos(await headers());
  } catch {
    return null;
  }
}

/** Apaga todos os links de nova senha ainda válidos da pessoa. */
export async function invalidarLinksDeRedefinicao(userId: string): Promise<void> {
  await prisma.verification.deleteMany({
    where: { identifier: { startsWith: PREFIXO_TOKEN }, value: userId },
  });
}

/** Monta o link e envia o e-mail do modelo `redefinir-senha`. `false` = não saiu (inclui APP_URL ausente). */
async function enviarEmailDoLink(
  user: { name: string; email: string },
  token: string,
  enviar: EnviarEmailTemplate,
): Promise<boolean> {
  const link = linkDeRedefinicao(process.env.APP_URL, token);
  if (!link) {
    console.error("[redefinir-senha] APP_URL ausente ou relativa: o link não pode ser montado.");
    return false;
  }
  return enviar(user.email, "redefinir-senha", {
    nome: primeiroNome(user.name),
    link,
    validade: VALIDADE_LINK_TEXTO,
  });
}

/**
 * Admin manda o link para a pessoa (tela de usuários). Mesmo token e mesmo e-mail do "Esqueci minha
 * senha", mas o admin precisa saber se saiu: o envio é aguardado e a recusa vem com o motivo
 * (o chamador transforma em ActionError). A senha atual continua valendo até a pessoa usar o link.
 */
export async function enviarLinkPeloAdmin(
  userId: string,
  opcoes: { smtpConfigurado: boolean; enviar?: EnviarEmailTemplate },
): Promise<{ ok: true; email: string } | { ok: false; motivo: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, ativo: true, acessoAte: true },
  });
  if (!user) return { ok: false, motivo: "Usuário não encontrado." };
  if (acessoBloqueado(user)) return { ok: false, motivo: MOTIVO_LINK_CONTA_INATIVA };
  if (!opcoes.smtpConfigurado) return { ok: false, motivo: MOTIVO_LINK_SEM_EMAIL_DO_SISTEMA };
  if (!linkDeRedefinicao(process.env.APP_URL, "x")) return { ok: false, motivo: MOTIVO_LINK_SEM_ENDERECO };

  const recentes = await prisma.verification.count({
    where: {
      identifier: { startsWith: PREFIXO_TOKEN },
      value: userId,
      createdAt: { gte: new Date(Date.now() - JANELA_LIMITE_MS) },
    },
  });
  if (recentes >= MAX_LINKS_POR_PESSOA) return { ok: false, motivo: MOTIVO_LINK_MUITOS };

  // Mesmo formato do better-auth (`generateId(24)`): `resetPassword` consome pelo identificador.
  const token = randomBytes(18).toString("base64url");
  const identifier = `${PREFIXO_TOKEN}${token}`;
  await prisma.verification.create({
    data: { identifier, value: userId, expiresAt: new Date(Date.now() + VALIDADE_LINK_SEG * 1000) },
  });
  let ok = false;
  try {
    ok = await enviarEmailDoLink(user, token, opcoes.enviar ?? enviarEmailTemplate);
  } catch (err) {
    console.error("[redefinir-senha] envio pelo admin falhou:", err);
  }
  // Link que não saiu não fica valendo nem gasta a cota da pessoa.
  if (!ok) {
    await prisma.verification.deleteMany({ where: { identifier } });
    return { ok: false, motivo: MOTIVO_LINK_FALHOU };
  }
  return { ok: true, email: user.email };
}

/** Um aviso por pessoa a cada 24 h: com o SMTP fora, cada pedido viraria uma notificação. */
async function avisarAdminsDaFalha(user: { name: string; email: string }): Promise<void> {
  const jaAvisado = await prisma.notificacao.findFirst({
    where: {
      titulo: TITULO_FALHA,
      corpo: { contains: `(${user.email})` },
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    select: { id: true },
  });
  if (jaAvisado) return;
  await notificarAdmins({
    titulo: TITULO_FALHA,
    corpo: `${user.name} (${user.email}) pediu uma nova senha, mas o e-mail não saiu. Redefina pela tela de usuários.`,
    href: "/configuracoes/usuarios",
  });
}

/**
 * Chamado pelo better-auth (`sendResetPassword`) depois de gravar o token. NUNCA lança: um erro
 * aqui viraria resposta diferente e revelaria que o e-mail existe.
 *
 * Acesso encerrado ou fora das cotas → o token é apagado e nada sai. E-mail que não saiu (SMTP
 * desligado, falha ou APP_URL ausente) → avisa os admins: a pessoa ainda pode ser atendida à mão.
 */
export async function enviarLinkDeRedefinicao(
  input: { userId: string; token: string; ip: string | null },
  enviar: EnviarEmailTemplate = enviarEmailTemplate,
): Promise<ResultadoEnvio> {
  const { userId, token, ip } = input;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, ativo: true, acessoAte: true },
    });
    const bloqueado = !user || acessoBloqueado(user);
    const cabeNaCotaDoIp =
      bloqueado || limitar(`redefinir-senha:pessoa:${ip ?? "sem-ip"}:${userId}`, MAX_LINKS_POR_PESSOA_E_IP).permitido;
    const linksRecentes = await prisma.verification.count({
      where: {
        identifier: { startsWith: PREFIXO_TOKEN },
        value: userId,
        createdAt: { gte: new Date(Date.now() - JANELA_LIMITE_MS) },
      },
    });
    const decisao = decidirEnvio({ bloqueado, cabeNaCotaDoIp, linksRecentes });

    if (!user || decisao !== "enviar") {
      await prisma.verification.deleteMany({ where: { identifier: `${PREFIXO_TOKEN}${token}` } });
      await logAudit({
        userId,
        modulo: "auth",
        acao: "enviar-link-nova-senha",
        resultado: "bloqueado",
        entidade: "User",
        entidadeId: userId,
        detalhe: { motivo: decisao },
        ip,
      });
      return decisao === "enviar" ? "bloqueado" : decisao;
    }

    const ok = await enviarEmailDoLink(user, token, enviar);

    await logAudit({
      userId,
      modulo: "auth",
      acao: "enviar-link-nova-senha",
      resultado: ok ? "sucesso" : "falha",
      entidade: "User",
      entidadeId: userId,
      ip,
    });

    if (!ok) {
      await avisarAdminsDaFalha(user);
      return "falhou";
    }
    return "enviado";
  } catch (err) {
    console.error("[redefinir-senha] falha ao enviar o link:", err);
    return "falhou";
  }
}

/**
 * Chamado pelo better-auth (`onPasswordReset`) depois de gravar a senha nova e antes de derrubar
 * as sessões: a senha foi escolhida pela própria pessoa, então não precisa trocar no próximo
 * login; outros links que ela tenha pedido deixam de valer.
 */
export async function aposRedefinirPeloLink(userId: string, ip: string | null): Promise<void> {
  // A senha já foi gravada: um erro aqui não pode impedir o better-auth de derrubar as sessões.
  try {
    await prisma.user.update({ where: { id: userId }, data: { mustChangePassword: false } });
    await prisma.solicitacaoResetSenha.updateMany({
      where: { userId, resolvida: false },
      data: { resolvida: true },
    });
    await invalidarLinksDeRedefinicao(userId);
  } catch (err) {
    console.error("[redefinir-senha] falha ao concluir a troca pelo link:", err);
  }
  await logAudit({
    userId,
    modulo: "auth",
    acao: "redefinir-senha-por-link",
    entidade: "User",
    entidadeId: userId,
    detalhe: { sessoesRevogadas: true },
    ip,
  });
}

/** O link ainda vale? (Só leitura — quem consome o token é o better-auth ao gravar a senha.) */
export async function linkDeRedefinicaoValido(token: unknown): Promise<boolean> {
  if (!tokenBemFormado(token)) return false;
  const v = await prisma.verification.findFirst({
    where: { identifier: `${PREFIXO_TOKEN}${token}`, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  return v !== null;
}
