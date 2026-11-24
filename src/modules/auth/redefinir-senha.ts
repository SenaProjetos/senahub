/**
 * Regras puras do "Esqueci minha senha" por link no e-mail (sem I/O, testadas).
 *
 * O link leva a `/redefinir-senha?token=…`; o token é o do better-auth (tabela `verification`,
 * identificador `reset-password:<token>`, valor = id do usuário). A senha só muda quando o dono
 * do e-mail abre o link e escolhe a nova — pedir o link nunca derruba o acesso de ninguém.
 */

/** Validade do link (segundos). */
export const VALIDADE_LINK_SEG = 60 * 60;

/** Texto da validade, para o e-mail e para a tela. */
export const VALIDADE_LINK_TEXTO = "1 hora";

/** Prefixo do identificador do token na tabela `verification` (definido pelo better-auth). */
export const PREFIXO_TOKEN = "reset-password:";

/** Janela das travas contra abuso. */
export const JANELA_LIMITE_MS = 15 * 60 * 1000;

/**
 * Links para a mesma pessoa pedidos do MESMO IP na janela. Por IP, e não só por pessoa: senão
 * quem conhece o e-mail de alguém gastaria a cota dela e a pessoa nunca receberia o próprio link.
 */
export const MAX_LINKS_POR_PESSOA_E_IP = 3;

/** Teto de links para a mesma pessoa na janela, somando todos os IPs (contra encher a caixa dela). */
export const MAX_LINKS_POR_PESSOA = 10;

/** Pedidos do mesmo IP na janela (qualquer e-mail). */
export const MAX_PEDIDOS_POR_IP = 10;

/** Tentativas de gravar senha pelo link do mesmo IP na janela. */
export const MAX_GRAVACOES_POR_IP = 20;

/** Mensagem única da tela de pedido: nunca revela se o e-mail existe nem o que aconteceu. */
export const MENSAGEM_PEDIDO =
  "Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha. Confira também a caixa de spam.";

export const MENSAGEM_LINK_INVALIDO = "Este link expirou ou já foi usado. Peça um novo na tela de login.";

// Motivos do "Enviar link de nova senha" da tela de usuários (admin). A mesma frase é o erro da
// action e o motivo do item desabilitado no menu (ADR-0002).
export const MOTIVO_LINK_CONTA_INATIVA = "Conta desativada ou com acesso encerrado não recebe link de nova senha.";
export const MOTIVO_LINK_SEM_EMAIL_DO_SISTEMA =
  "O envio de e-mail do sistema não está configurado. Use “Gerar senha temporária”.";
export const MOTIVO_LINK_SEM_ENDERECO =
  "O endereço público do sistema (APP_URL) não está configurado. Use “Gerar senha temporária”.";
export const MOTIVO_LINK_MUITOS =
  "Já saíram muitos links para esta pessoa nos últimos 15 minutos. Aguarde ou gere uma senha temporária.";
export const MOTIVO_LINK_FALHOU = "Não foi possível enviar o e-mail agora. Tente de novo ou gere uma senha temporária.";

export type DecisaoEnvio = "enviar" | "bloqueado" | "limite";

/**
 * Decide se o link vai por e-mail. `cabeNaCotaDoIp` = o limitador por pessoa+IP deixou passar;
 * `linksRecentes` conta os tokens da pessoa criados na janela, INCLUINDO o que acabou de ser
 * criado (o better-auth grava antes de chamar o envio).
 */
export function decidirEnvio(input: {
  bloqueado: boolean;
  cabeNaCotaDoIp: boolean;
  linksRecentes: number;
}): DecisaoEnvio {
  if (input.bloqueado) return "bloqueado";
  if (!input.cabeNaCotaDoIp || input.linksRecentes > MAX_LINKS_POR_PESSOA) return "limite";
  return "enviar";
}

/** Formato do token gerado pelo better-auth (`generateId(24)`); recusa lixo antes de ir ao banco. */
export function tokenBemFormado(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(token);
}

/** IP de quem pediu: o da Cloudflare primeiro (o `x-forwarded-for` vem de quem faz a requisição). */
export function ipDosCabecalhos(h: { get(nome: string): string | null }): string | null {
  const cloudflare = h.get("cf-connecting-ip")?.trim();
  if (cloudflare) return cloudflare.slice(0, 64);
  const encaminhado = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (encaminhado) return encaminhado.slice(0, 64);
  return h.get("x-real-ip")?.trim().slice(0, 64) || null;
}

/** Link que vai no e-mail; `null` sem a origem pública configurada (um link relativo não abre). */
export function linkDeRedefinicao(appUrl: string | undefined, token: string): string | null {
  const base = (appUrl ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) return null;
  return `${base}/redefinir-senha?token=${encodeURIComponent(token)}`;
}

/** Primeiro nome, para o tom do e-mail (todo usuário tem nome; vazio só por segurança). */
export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? "").trim().split(/\s+/)[0] ?? "";
}
