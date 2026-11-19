/**
 * Quem pode baixar as entregas de um projeto pelo portal do cliente. Puro (sem I/O), testado; a leitura
 * de sessão, termo e projeto fica em `acesso.ts`.
 *
 * As rotas de download não passam pelo layout do dashboard, então repetem as travas dele: troca de
 * senha pendente e termo de uso do cliente sem aceite. Elas só são cobradas DEPOIS de saber que o projeto
 * é da pessoa — antes disso, tudo é o mesmo 404 neutro, que não revela se o projeto existe.
 * Perfil de acesso não entra: a regra do cliente é `tipo` + `clienteId`, como em `/api/portal/documentos`.
 */

export type EntradaAcessoPortal = {
  temSessao: boolean;
  tipo: "interno" | "externo" | null;
  clienteId: string | null;
  mustChangePassword: boolean;
  termoPendente: boolean;
  /** Cliente dono do projeto pedido; null = o projeto não existe. */
  projetoClienteId: string | null;
};

export type DecisaoAcessoPortal = { ok: true } | { ok: false; status: 401 | 403 | 404; erro: string };

export const MSG_PORTAL = {
  semSessao: "Não autenticado.",
  indisponivel: "Arquivo indisponível.",
  termo: "Aceite o termo de uso para continuar.",
  senha: "Troque a senha para continuar.",
} as const;

export function decidirAcessoPortal(e: EntradaAcessoPortal): DecisaoAcessoPortal {
  if (!e.temSessao) return { ok: false, status: 401, erro: MSG_PORTAL.semSessao };
  if (e.tipo !== "externo" || !e.clienteId || e.projetoClienteId !== e.clienteId) {
    return { ok: false, status: 404, erro: MSG_PORTAL.indisponivel };
  }
  if (e.mustChangePassword) return { ok: false, status: 403, erro: MSG_PORTAL.senha };
  if (e.termoPendente) return { ok: false, status: 403, erro: MSG_PORTAL.termo };
  return { ok: true };
}
