import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { listarClientes } from "@/modules/clientes/queries";
import { nomesModalidadesAtivas } from "@/modules/licitacoes/modalidades/queries";
import { listarLicitacoes } from "@/modules/licitacoes/queries";
import { listarChecklistModelos } from "@/modules/licitacoes/habilitacao/queries";
import { prisma } from "@/lib/prisma";
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

  const [data, clientes, modalidades, modelos, certidoes] = await Promise.all([
    listarLicitacoes(filtro),
    listarClientes({ incluirInativos: false }),
    nomesModalidadesAtivas(),
    listarChecklistModelos(false),
    prisma.certidao.findMany({ include: { tipo: true }, orderBy: { validade: "desc" } }),
  ]);

  return (
    <LicitacoesView
      podeGerir={podeGerir}
      modalidades={modalidades}
      clientes={clientes.map((c) => ({ id: c.id, nome: c.nome }))}
      licitacoes={data.rows}
      total={data.total}
      page={data.page}
      pages={data.pages}
      pageSize={data.pageSize}
      filtro={{ status: filtro.status, orgao: filtro.orgao, q: filtro.q }}
      modelosHabilitacao={modelos.map((m) => ({ id: m.id, nome: m.nome }))}
      certidoes={certidoes.map((c) => ({
        id: c.id,
        nome: c.descricao ? `${c.tipo.nome} — ${c.descricao}` : c.tipo.nome,
        validade: c.validade.toISOString().slice(0, 10),
      }))}
    />
  );
}
