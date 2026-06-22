import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { obterProjeto } from "@/modules/projetos/queries";
import { listarInputs, linkInput, progressoInputs } from "@/modules/inputs/queries";
import { InputsPanel } from "@/components/inputs/inputs-panel";

export const metadata: Metadata = { title: "Inputs — Projeto" };

export default async function ProjetoInputsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("projetos", "ver");
  const { id } = await params;
  const projeto = await projetoVisivel(user, id);
  if (!projeto) notFound();

  const [podeGerir, projetoCompleto, inputs, link, progresso] = await Promise.all([
    can(user.role, "projetos", "gerir"),
    obterProjeto(user, id),
    listarInputs(id),
    linkInput(id),
    progressoInputs(id),
  ]);
  if (!projetoCompleto) notFound();

  const baseUrl = process.env.APP_URL ?? "";

  return (
    <InputsPanel
      projetoId={id}
      podeGerir={podeGerir}
      disciplinas={projetoCompleto.disciplinas.map((d) => d.nome)}
      itens={inputs.map((i) => ({
        id: i.id,
        disciplina: i.disciplina,
        pergunta: i.pergunta,
        resposta: i.resposta ?? "",
      }))}
      progresso={progresso}
      token={link?.ativo ? link.token : null}
      baseUrl={baseUrl}
    />
  );
}
