import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { pedidosParaCoordenacao } from "@/modules/portal/pedido-revisao/queries";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { PedidosClienteView } from "@/components/arquivos/pedidos-cliente-view";

export const metadata: Metadata = { title: "Pedidos do cliente" };

export default async function PedidosClientePage({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  // Decidir é escrita: `can()` puro, e NÃO `requirePermission` (que aplica o piso de sócio, só leitura). O gate é o
  // mesmo de marcar "Em revisão" e das ações de aceitar/recusar.
  const user = await requireUser();
  if (user.tipo !== "interno" || !(await can(user, "arquivos", "alterar_status"))) redirect("/sem-permissao");
  const { filtro: f } = await searchParams;
  const filtro = f === "respondidos" ? "respondidos" : "aguardando";
  const [pedidos, podeValidar] = [await pedidosParaCoordenacao(user, filtro), await can(user, "uploads", "validar")];

  return (
    <div className="space-y-4">
      <CabecalhoPagina titulo="Pedidos do cliente" descricao="Pedidos de revisão de pranchas feitos pelos clientes no portal." />
      <PedidosClienteView pedidos={pedidos} filtro={filtro} podeValidar={podeValidar} />
    </div>
  );
}
