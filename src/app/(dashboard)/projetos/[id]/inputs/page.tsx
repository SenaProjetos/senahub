import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { obterProjeto } from "@/modules/projetos/queries";
import { listarInputs, linkInput, progressoInputs, obterBriefing } from "@/modules/inputs/queries";
import {
  prePopularRespostas,
  calcularStatusBriefing,
  type StatusBriefing,
} from "@/modules/inputs/briefing-schema";
import { InputsPanel } from "@/components/inputs/inputs-panel";
import { BriefingSection } from "@/components/inputs/briefing-section";

export const metadata: Metadata = { title: "Inputs — Projeto" };

export default async function ProjetoInputsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("projetos", "ver");
  const { id } = await params;
  const projeto = await projetoVisivel(user, id);
  if (!projeto) notFound();

  const [podeGerir, projetoCompleto, inputs, link, progresso, briefing] = await Promise.all([
    can(user.role, "projetos", "gerir"),
    obterProjeto(user, id),
    listarInputs(id),
    linkInput(id),
    progressoInputs(id),
    obterBriefing(id),
  ]);
  if (!projetoCompleto) notFound();

  const baseUrl = process.env.APP_URL ?? "";
  const disciplinas = projetoCompleto.disciplinas.map((d) => d.nome);

  // Respostas do briefing + pré-população do cadastro (sem sobrescrever o já preenchido).
  const respostasSalvas = (briefing?.respostasJson as Record<string, unknown> | null) ?? {};
  const cliente = projetoCompleto.cliente;
  const respostasIniciais = prePopularRespostas(respostasSalvas, {
    nome: cliente?.nome,
    email: cliente?.email,
    telefone: cliente?.telefone,
    endereco: projetoCompleto.endereco ?? undefined,
  });
  const statusBriefing: StatusBriefing = (briefing?.status as StatusBriefing) ?? calcularStatusBriefing(respostasSalvas);

  return (
    <div className="space-y-4">
      <BriefingSection
        projetoId={id}
        respostasIniciais={respostasIniciais}
        disciplinas={disciplinas}
        canEdit={podeGerir}
        status={statusBriefing}
      />

      <InputsPanel
        projetoId={id}
        podeGerir={podeGerir}
        disciplinas={disciplinas}
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
    </div>
  );
}
