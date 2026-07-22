import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { listarNotificacoesPaginado, type FiltroNotificacao } from "@/modules/notificacoes/queries";
import { NotificacoesView } from "@/components/notificacoes/notificacoes-view";
import { parseListParams } from "@/lib/list-params";

export const metadata: Metadata = { title: "Notificações" };

type SP = { filtro?: string; page?: string; pageSize?: string };

export default async function NotificacoesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const { page, pageSize, skip, take } = parseListParams(sp, {
    sortFields: [],
    defaultPageSize: 24,
  });

  const filtro: FiltroNotificacao =
    sp.filtro === "nao_lidas" || sp.filtro === "lidas" ? sp.filtro : "todas";

  const { itens, total, naoLidas, pageCount } = await listarNotificacoesPaginado(user.id, {
    skip,
    take,
    filtro,
  });

  return (
    <NotificacoesView
      itens={itens.map((n) => ({
        id: n.id,
        titulo: n.titulo,
        corpo: n.corpo,
        href: n.href,
        lida: n.lida,
        createdAt: n.createdAt.toISOString(),
      }))}
      total={total}
      naoLidas={naoLidas}
      filtro={filtro}
      page={page}
      pageCount={pageCount}
      pageSize={pageSize}
    />
  );
}
