import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { listarRfqs } from "@/modules/custos/cotacoes/queries";
import { pageCount } from "@/lib/list-params";
import { CotacoesView } from "@/components/custos/cotacoes/cotacoes-view";

export const metadata: Metadata = { title: "Cotações — Engenharia de Custos" };

export default async function CotacoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("custos", "cotacao");
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "";

  const { itens, total, page, pageSize } = await listarRfqs(sp, { status: status || undefined });

  return (
    <CotacoesView
      itens={itens}
      total={total}
      page={page}
      pageCount={pageCount(total, pageSize)}
      pageSize={pageSize}
      q={typeof sp.q === "string" ? sp.q : ""}
      status={status}
    />
  );
}
