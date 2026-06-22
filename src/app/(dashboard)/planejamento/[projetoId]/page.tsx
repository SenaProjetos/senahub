import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { projetoVisivel, eapDoProjeto, planoVsRealProjeto } from "@/modules/planejamento/queries";
import { EapWorkspace } from "@/components/planejamento/eap-workspace";
import { PlanoVsReal } from "@/components/planejamento/plano-vs-real";

export const metadata: Metadata = { title: "Planejamento do projeto" };

export default async function PlanejamentoProjetoPage({
  params,
}: {
  params: Promise<{ projetoId: string }>;
}) {
  const { projetoId } = await params;
  const user = await requirePermission("planejamento", "ver");
  const projeto = await projetoVisivel(user, projetoId);
  if (!projeto) notFound();

  const [{ tarefas, disciplinas, temLinhaBase }, podeGerir, planoReal] = await Promise.all([
    eapDoProjeto(projetoId),
    can(user.role, "planejamento", "gerir"),
    planoVsRealProjeto(projetoId),
  ]);

  return (
    <div className="space-y-6">
      <EapWorkspace
        projeto={projeto}
        tarefas={tarefas}
        disciplinas={disciplinas}
        temLinhaBase={temLinhaBase}
        podeGerir={podeGerir}
      />
      <PlanoVsReal dados={planoReal} />
    </div>
  );
}
