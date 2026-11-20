import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { pedidoParaCoordenacao } from "@/modules/portal/pedido-revisao/queries";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { PedidoClienteDetalhe } from "@/components/arquivos/pedido-cliente-detalhe";

export const metadata: Metadata = { title: "Pedido do cliente" };

export default async function PedidoClientePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user.tipo !== "interno" || !(await can(user, "arquivos", "alterar_status"))) redirect("/sem-permissao");
  const { id } = await params;
  const pedido = await pedidoParaCoordenacao(user, id);
  if (!pedido) notFound();
  const podeValidar = await can(user, "uploads", "validar");

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Pedido de revisão"
        descricao={`${pedido.prancha} · ${pedido.revisao} · ${pedido.projeto.nome}`}
        trilha={[{ label: "Pedidos do cliente", href: "/arquivos/pedidos-cliente" }, { label: pedido.prancha }]}
      />
      <PedidoClienteDetalhe pedido={pedido} podeValidar={podeValidar} />
    </div>
  );
}
