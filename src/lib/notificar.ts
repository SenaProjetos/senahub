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

/**
 * Cria a notificação interna (sino) e dispara Web Push para um usuário.
 * Respeita opt-out por categoria: se `opts.categoria` estiver presente e o usuário
 * optou por sair dela, nada é enviado. (Antes só `notificarMuitos` filtrava — agora o
 * filtro vive aqui, então notificações individuais também respeitam as Preferências.)
 */
export async function notificar(
  userId: string,
  n: NotificacaoInput,
  opts?: NotificarOpts,
): Promise<void> {
  if (opts?.categoria) {
    const permitido = await filtrarPorCategoria([userId], opts.categoria);
    if (permitido.length === 0) return;
  }
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
  // Já filtrado em massa; ao delegar não repassa `categoria` para não refiltrar por id.
  const optsSemCategoria = opts ? { push: opts.push } : undefined;
  await Promise.all(destinatarios.map((id) => notificar(id, n, optsSemCategoria)));
}
