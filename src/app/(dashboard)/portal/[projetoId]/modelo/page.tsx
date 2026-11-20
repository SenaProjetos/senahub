import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Box, Download } from "lucide-react";
import { requireUser } from "@/lib/session";
import { clienteDoUsuario, projetoDoCliente } from "@/modules/portal/queries";
import { modelosDoPortal } from "@/modules/portal/modelo3d/queries";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { VisualizadorModeloDinamico } from "@/components/portal/modelo3d/visualizador-modelo-dinamico";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Modelo 3D" };

/** Modelo 3D do portal do cliente: os IFCs das Entregas (e os enviados pelo cliente) juntos, para explorar. */
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
  const algumPronto = modelos.some((m) => m.situacao === "pronto");
  const daEntrega = modelos.filter((m) => m.origem === "entrega" && m.origemUploadId);

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
      {algumPronto ? (
        <VisualizadorModeloDinamico projetoId={projetoId} modelos={modelos} foco={foco} />
      ) : (
        <Card>
          <CardContent>
            <EmptyState
              icon={Box}
              title={modelos.length > 0 ? "O modelo 3D ainda não está pronto." : "Este projeto ainda não tem modelo 3D."}
              description={
                modelos.length > 0
                  ? "O arquivo IFC está sendo preparado para ver no navegador. Enquanto isso, você pode baixá-lo nas Entregas."
                  : "Quando a equipe compartilhar um modelo IFC nas Entregas, ele aparece aqui."
              }
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
