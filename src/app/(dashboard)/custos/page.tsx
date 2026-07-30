import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { listarOrcamentos } from "@/modules/custos/queries";
import { pageCount } from "@/lib/list-params";
import { CustosView } from "@/components/custos/custos-view";
import type { StatusCustoOrcamento } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Engenharia de Custos" };

export default async function CustosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("custos", "ver");
  const [podeGerir, podeBancos, podeCotacao] = await Promise.all([
    can(user.role, "custos", "gerir"),
    can(user.role, "custos", "bancos"),
    can(user.role, "custos", "cotacao"),
  ]);
  const sp = await searchParams;

  const status = typeof sp.status === "string" ? sp.status : "";
  const { itens, total, page, pageSize } = await listarOrcamentos(sp, user, {
    status: status ? (status as StatusCustoOrcamento) : undefined,
  });

  return (
    <CustosView
      itens={itens}
      total={total}
      page={page}
      pageCount={pageCount(total, pageSize)}
      pageSize={pageSize}
      q={typeof sp.q === "string" ? sp.q : ""}
      status={status}
      podeGerir={podeGerir}
      podeBancos={podeBancos}
      podeCotacao={podeCotacao}
    />
  );
}
