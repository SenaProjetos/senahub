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
  const pedidos = await pedidosParaCoordenacao(user, filtro);
  // A tela já sabe quem decide o quê: prancha = `uploads:validar`, modelo 3D = `coordenacao:gerir` (o servidor confere).
  const poderes = { podeValidar: await can(user, "uploads", "validar"), podeCoordenar: await can(user, "coordenacao", "gerir") };

  return (
    <div className="space-y-4">
      <CabecalhoPagina titulo="Pedidos do cliente" descricao="Pedidos de revisão de pranchas e do modelo 3D feitos pelos clientes no portal." />
      <PedidosClienteView pedidos={pedidos} filtro={filtro} poderes={poderes} />
    </div>
  );
}
