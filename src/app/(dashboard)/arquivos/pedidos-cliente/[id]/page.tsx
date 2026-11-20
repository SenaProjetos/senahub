import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { marcacoesDoPedido, pedidoParaCoordenacao } from "@/modules/portal/pedido-revisao/queries";
import { modeloDoPedidoParaCoordenacao } from "@/modules/portal/pedido-revisao/modelo-queries";
import { rotuloDoPedido } from "@/modules/portal/pedido-revisao/modelo-regras";
import { VisualizadorPrancha } from "@/components/portal/visualizador/visualizador-prancha";
import { VisualizadorModeloDinamico } from "@/components/portal/modelo3d/visualizador-modelo-dinamico";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { PedidoClienteDetalhe } from "@/components/arquivos/pedido-cliente-detalhe";

export const metadata: Metadata = { title: "Pedido do cliente" };

export default async function PedidoClientePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user.tipo !== "interno" || !(await can(user, "arquivos", "alterar_status"))) redirect("/sem-permissao");
  const { id } = await params;
  const pedido = await pedidoParaCoordenacao(user, id);
  if (!pedido) notFound();
  // A tela já sabe quem decide o quê: prancha = `uploads:validar`, modelo 3D = `coordenacao:gerir` (o servidor confere).
  const poderes = { podeValidar: await can(user, "uploads", "validar"), podeCoordenar: await can(user, "coordenacao", "gerir") };
  const ehModelo = pedido.tipo === "modelo";
  const marcas = ehModelo ? null : await marcacoesDoPedido(pedido.id);
  const modelo = ehModelo ? await modeloDoPedidoParaCoordenacao(pedido.id) : null;
  // O 3D em leitura sai pela rota `.frag` da coordenação: só para quem vê a Coordenação.
  const ve3d = ehModelo && (await can(user, "coordenacao", "ver"));
  const titulo = rotuloDoPedido(pedido);

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Pedido de revisão"
        descricao={[titulo, pedido.revisao, pedido.projeto.nome].filter(Boolean).join(" · ")}
        trilha={[{ label: "Pedidos do cliente", href: "/arquivos/pedidos-cliente" }, { label: titulo }]}
      />
      <PedidoClienteDetalhe
        pedido={pedido}
        poderes={poderes}
        marcasModelo={modelo?.marcas}
        versaoMaisNova={modelo?.versaoMaisNova ?? false}
        visualizador={
          modelo && ve3d && modelo.marcas.length > 0 && modelo.modelos.length > 0 ? (
            <VisualizadorModeloDinamico projetoId={pedido.projeto.id} modelos={modelo.modelos} leitura={modelo.marcas} />
          ) : pedido.uploadId && marcas && marcas.marcacoes.length > 0 ? (
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
