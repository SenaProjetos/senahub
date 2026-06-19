import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { listarLicitacoesResumo } from "@/modules/licitacoes/queries";
import { LicitacoesView } from "@/components/licitacoes/licitacoes-view";

export const metadata: Metadata = { title: "Licitações" };

export default async function LicitacoesPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    orgao?: string;
    q?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const user = await requirePermission("licitacoes", "ver");
  const podeGerir = await can(user.role, "licitacoes", "gerir");
  const sp = await searchParams;
  const filtro = {
    status: sp.status ? sp.status.split(",").filter(Boolean) : [],
    orgao: sp.orgao ?? "",
    q: sp.q ?? "",
    page: sp.page ? Number(sp.page) : 1,
    pageSize: sp.pageSize ? Number(sp.pageSize) : undefined,
  };
  const data = await listarLicitacoesResumo(filtro);
  return (
    <LicitacoesView
      podeGerir={podeGerir}
      licitacoes={data.rows}
      total={data.total}
      page={data.page}
      pages={data.pages}
      pageSize={data.pageSize}
      filtro={{ status: filtro.status, orgao: filtro.orgao, q: filtro.q }}
    />
  );
}
