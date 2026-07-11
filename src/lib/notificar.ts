import "server-only";
import { prisma } from "@/lib/prisma";
import { enviarPush } from "@/lib/push";
import { filtrarPorCategoria } from "@/modules/usuarios/preferencias/queries";

export type NotificacaoInput = {
  titulo: string;
  corpo?: string;
  href?: string;
  tag?: string;
};

export type NotificarOpts = {
  /** Quando false, cria só a notificação interna (sino) sem Web Push — ex.: "não perturbe". */
  push?: boolean;
  /**
   * Categoria da notificação — usada para respeitar preferências de opt-out.
   * Ex.: "prazo_disciplina", "inadimplencia", "digest_semanal", "certidao", "licitacao",
   * "coordenacao".
   * Quando ausente, a notificação é sempre enviada.
   */
  categoria?: string;
};

/** Cria a notificação interna (sino) e dispara Web Push para um usuário. */
export async function notificar(
  userId: string,
  n: NotificacaoInput,
  opts?: NotificarOpts,
): Promise<void> {
  await prisma.notificacao.create({
    data: { userId, titulo: n.titulo, corpo: n.corpo, href: n.href },
  });
  if (opts?.push !== false) {
    await enviarPush(userId, { title: n.titulo, body: n.corpo, url: n.href, tag: n.tag });
  }
}

/** Notifica vários usuários (deduplicados), respeitando opt-out por categoria. */
export async function notificarMuitos(
  userIds: string[],
  n: NotificacaoInput,
  opts?: NotificarOpts,
): Promise<void> {
  const unicos = [...new Set(userIds)];
  const destinatarios = opts?.categoria
    ? await filtrarPorCategoria(unicos, opts.categoria)
    : unicos;
  await Promise.all(destinatarios.map((id) => notificar(id, n, opts)));
}
