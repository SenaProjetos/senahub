import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { listarPropostas, totalProposta } from "@/modules/comercial/queries";
import { listarClientes } from "@/modules/clientes/queries";
import { PropostasView } from "@/components/comercial/propostas-view";

export const metadata: Metadata = { title: "Propostas" };

export default async function PropostasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requirePermission("comercial", "ver");
  const podeGerir = await can(user.role, "comercial", "gerir");
  const sp = await searchParams;
  const [propostas, clientes] = await Promise.all([
    listarPropostas(sp.status),
    podeGerir ? listarClientes({ incluirInativos: false }) : Promise.resolve([]),
  ]);

  return (
    <PropostasView
      podeGerir={podeGerir}
      status={sp.status ?? ""}
      clientes={clientes.map((c) => ({ id: c.id, nome: c.nome }))}
      propostas={propostas.map((p) => ({
        id: p.id,
        numero: p.numero,
        titulo: p.titulo,
        cliente: p.cliente.nome,
        status: p.status,
        total: totalProposta(p.itens),
        visualizacoes: p._count.visualizacoes,
        atualizadoEm: p.updatedAt.toISOString(),
      }))}
    />
  );
}
