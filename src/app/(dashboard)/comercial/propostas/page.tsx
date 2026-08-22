import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { listarPropostas, totalProposta, negociacoesParaSelecao } from "@/modules/comercial/queries";
import { listarClientes } from "@/modules/clientes/queries";
import { PropostasView } from "@/components/comercial/propostas-view";

export const metadata: Metadata = { title: "Propostas" };

export default async function PropostasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requirePermission("comercial", "ver");
  const podeGerir = await can(user, "comercial", "gerir");
  const sp = await searchParams;
  const [propostas, clientes, negociacoes] = await Promise.all([
    listarPropostas(sp.status),
    podeGerir ? listarClientes({ incluirInativos: false }) : Promise.resolve([]),
    podeGerir ? negociacoesParaSelecao() : Promise.resolve([]),
  ]);

  return (
    <PropostasView
      podeGerir={podeGerir}
      status={sp.status ?? ""}
      clientes={clientes.map((c) => ({ id: c.id, nome: c.nome }))}
      negociacoes={negociacoes.map((n) => ({ id: n.id, titulo: n.titulo, clienteId: n.clienteId }))}
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
