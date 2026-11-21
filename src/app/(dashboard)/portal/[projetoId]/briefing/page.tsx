import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { clienteDoUsuario, projetoDoCliente } from "@/modules/portal/queries";
import { briefingDoPortal } from "@/modules/portal/briefing-queries";
import { MOTIVO_ENCERRADO } from "@/modules/inputs/portal-pedido";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { BriefingDoPortal } from "@/components/portal/briefing-do-portal";

export const metadata: Metadata = { title: "Briefing do projeto" };

/**
 * Briefing do projeto no portal do cliente: o formulário da equipe (modelo, disciplinas e ocultações do projeto) mais
 * as perguntas extras. Só existe depois que a equipe pede pelo portal; encerrado pela equipe, fica só para leitura.
 */
export default async function BriefingDoPortalPage({ params }: { params: Promise<{ projetoId: string }> }) {
  const user = await requireUser();
  if (user.tipo === "interno") redirect("/");
  const cliente = await clienteDoUsuario(user.id);
  if (!cliente || !cliente.ativo) redirect("/portal");

  const { projetoId } = await params;
  const projeto = await projetoDoCliente(cliente.clienteId, projetoId);
  if (!projeto) notFound();
  const briefing = await briefingDoPortal(projetoId);
  if (!briefing) notFound();
  const encerrado = briefing.situacao === "encerrado";

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Briefing do projeto"
        descricao={projeto.nome}
        trilha={[
          { label: "Meus projetos", href: "/portal" },
          { label: projeto.nome, href: `/portal/${projetoId}` },
          { label: "Briefing" },
        ]}
      />
      {encerrado && (
        <p role="status" className="rounded-sm border bg-card p-4 text-sm text-muted-foreground">
          {MOTIVO_ENCERRADO}
        </p>
      )}
      <BriefingDoPortal
        projetoId={projetoId}
        secoes={briefing.secoes}
        respostas={briefing.respostas}
        extras={briefing.extras}
        somenteLeitura={encerrado}
      />
    </div>
  );
}
