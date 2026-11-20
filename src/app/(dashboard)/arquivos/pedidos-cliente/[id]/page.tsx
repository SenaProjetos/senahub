import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { marcacoesDoPedido, pedidoParaCoordenacao } from "@/modules/portal/pedido-revisao/queries";
import { VisualizadorPrancha } from "@/components/portal/visualizador/visualizador-prancha";
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
  const marcas = await marcacoesDoPedido(pedido.id);

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Pedido de revisão"
        descricao={`${pedido.prancha} · ${pedido.revisao} · ${pedido.projeto.nome}`}
        trilha={[{ label: "Pedidos do cliente", href: "/arquivos/pedidos-cliente" }, { label: pedido.prancha }]}
      />
      <PedidoClienteDetalhe
        pedido={pedido}
        podeValidar={podeValidar}
        visualizador={
          marcas && marcas.marcacoes.length > 0 ? (
            <VisualizadorPrancha
              pdfUrl={`/api/uploads/${pedido.uploadId}/download?disposition=inline`}
              uploadId={pedido.uploadId}
              calibracoes={marcas.calibracoes}
              leitura={marcas.marcacoes}
              rotuloLeitura="Marcações do cliente (os números seguem a lista acima)."
            />
          ) : null
        }
      />
    </div>
  );
}
