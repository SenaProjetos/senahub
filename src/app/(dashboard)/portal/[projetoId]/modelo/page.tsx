import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Box, Download } from "lucide-react";
import { requireUser } from "@/lib/session";
import { clienteDoUsuario, projetoDoCliente } from "@/modules/portal/queries";
import { modelosDoPortal } from "@/modules/portal/modelo3d/queries";
import { motivoSemModelo } from "@/modules/portal/modelo3d/regras";
import { marcasAguardandoNoModelo } from "@/modules/portal/pedido-revisao/modelo-queries";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { VisualizadorModeloDinamico } from "@/components/portal/modelo3d/visualizador-modelo-dinamico";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Modelo 3D" };

const TEXTO_SEM_MODELO = {
  vazio: {
    titulo: "Este projeto ainda não tem modelo 3D.",
    descricao: "Quando a equipe compartilhar um modelo IFC nas Entregas, ele aparece aqui.",
  },
  preparando: {
    titulo: "O modelo 3D ainda não está pronto.",
    descricao: "O arquivo IFC está sendo preparado para ver no navegador. Enquanto isso, você pode baixá-lo nas Entregas.",
  },
  erro: {
    titulo: "O modelo 3D não pôde ser preparado.",
    descricao: "Fale com a equipe do projeto. Enquanto isso, você pode baixar o arquivo IFC nas Entregas.",
  },
} as const;

/**
 * Modelo 3D do portal do cliente: os IFCs das Entregas (e os enviados pelo cliente) juntos, para explorar e pedir
 * revisão marcando os elementos. As marcações dos pedidos que ainda aguardam a equipe aparecem esmaecidas.
 */
export default async function ModeloDoPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ projetoId: string }>;
  searchParams: Promise<{ modelo?: string | string[] }>;
}) {
  const user = await requireUser();
  if (user.tipo === "interno") redirect("/");
  const cliente = await clienteDoUsuario(user.id);
  if (!cliente || !cliente.ativo) redirect("/portal");

  const { projetoId } = await params;
  const projeto = await projetoDoCliente(cliente.clienteId, projetoId);
  if (!projeto) notFound();
  const modelos = await modelosDoPortal(user, projetoId);
  if (!modelos) notFound();
  const { modelo } = await searchParams;
  const foco = typeof modelo === "string" ? modelo : null;
  const motivo = motivoSemModelo(modelos.map((m) => m.situacao));
  const texto = motivo ? TEXTO_SEM_MODELO[motivo] : null;
  const daEntrega = modelos.filter((m) => m.origem === "entrega" && m.origemUploadId);
  // As marcações esmaecidas são só um aviso: se a leitura falhar, o 3D abre sem elas.
  const aguardando = texto
    ? []
    : await marcasAguardandoNoModelo(
        projetoId,
        cliente.clienteId,
        modelos.filter((m) => m.situacao === "pronto").map((m) => m.modeloId),
      ).catch((e: unknown) => {
        console.error("[portal] marcações aguardando do 3D não carregaram:", e);
        return [];
      });

  return (
    <div className="space-y-3">
      <CabecalhoPagina
        titulo="Modelo 3D"
        descricao={projeto.nome}
        trilha={[
          { label: "Meus projetos", href: "/portal" },
          { label: projeto.nome, href: `/portal/${projetoId}` },
          { label: "Modelo 3D" },
        ]}
      />
      {!texto ? (
        <VisualizadorModeloDinamico
          projetoId={projetoId}
          modelos={modelos}
          foco={foco}
          pedir={{ userId: user.id, voltarPara: `/portal/${projetoId}` }}
          aguardando={aguardando}
        />
      ) : (
        <Card>
          <CardContent>
            <EmptyState
              icon={Box}
              title={texto.titulo}
              description={texto.descricao}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {daEntrega.map((m) => (
                    <Button
                      key={m.modeloId}
                      size="sm"
                      variant="outline"
                      className="max-w-full"
                      render={<a href={`/api/portal/projetos/${projetoId}/arquivos/${m.origemUploadId}`} />}
                    >
                      <Download className="size-4" /> <span className="truncate">Baixar {m.nomeArquivo}</span>
                    </Button>
                  ))}
                  <Button size="sm" variant="ghost" render={<Link href={`/portal/${projetoId}`} />}>
                    Ver as Entregas
                  </Button>
                </div>
              }
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
