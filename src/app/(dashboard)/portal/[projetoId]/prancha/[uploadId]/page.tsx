import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { pranchaParaPortal } from "@/modules/portal/pedido-revisao/queries";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { VisualizadorPrancha } from "@/components/portal/visualizador/visualizador-prancha";

export const metadata: Metadata = { title: "Prancha" };

/** Visualizador da prancha no portal do cliente: ver, dar zoom e pedir revisão com marcações. */
export default async function PranchaDoPortalPage({ params }: { params: Promise<{ projetoId: string; uploadId: string }> }) {
  const user = await requireUser();
  if (user.tipo === "interno") redirect("/");
  const { projetoId, uploadId } = await params;
  const prancha = await pranchaParaPortal(user, projetoId, uploadId);
  if (!prancha) notFound();

  return (
    <div className="space-y-3">
      <CabecalhoPagina
        titulo={prancha.nome}
        descricao={`${prancha.revisao} · ${prancha.projetoNome}`}
        trilha={[
          { label: "Meus projetos", href: "/portal" },
          { label: prancha.projetoNome, href: `/portal/${projetoId}` },
          { label: prancha.nome },
        ]}
      />
      <VisualizadorPrancha
        pdfUrl={`/api/portal/projetos/${projetoId}/arquivos/${uploadId}?disposition=inline`}
        uploadId={uploadId}
        calibracoes={prancha.calibracoes}
        leitura={prancha.aguardando}
        rotuloLeitura="Em cinza: marcações de pedidos que ainda aguardam a equipe."
        pedir={{ projetoId, voltarPara: `/portal/${projetoId}`, userId: user.id }}
      />
    </div>
  );
}
