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
import { LinkPublicoInputsButton } from "@/components/inputs/link-publico-inputs-dialog";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { linkVigente } from "@/lib/link-publico";
import { formatarDataHora } from "@/lib/utils";

export const metadata: Metadata = { title: "Inputs — Projeto" };

export default async function ProjetoInputsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("projetos", "ver");
  const { id } = await params;
  const projeto = await projetoVisivel(user, id);
  if (!projeto) notFound();

  const [podeGerir, projetoCompleto, inputs, link, progresso, briefing] = await Promise.all([
    can(user, "projetos", "gerir"),
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

  // Situação do link em uma frase — o botão fica ACIMA do formulário, porque o
  // link abre o formulário inteiro (briefing + perguntas extras).
  const vigente = link ? linkVigente(link) : false;
  const situacaoLink = !link
    ? "Nenhum link gerado — o cliente ainda não consegue preencher sozinho."
    : !link.ativo
      ? "Link revogado. Reative para o cliente voltar a preencher."
      : link.expiraEm && !vigente
        ? `Link expirado em ${formatarDataHora(link.expiraEm)}.`
        : link.expiraEm
          ? `Link ativo até ${formatarDataHora(link.expiraEm)}.`
          : "Link ativo, sem data de expiração.";

  return (
    <div className="space-y-4">
      {podeGerir && (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div className="min-w-0">
              <CardTitle className="text-base">Formulário do cliente</CardTitle>
              <CardDescription>{situacaoLink}</CardDescription>
            </div>
            <LinkPublicoInputsButton
              projetoId={id}
              baseUrl={baseUrl}
              link={
                link
                  ? { token: link.token, ativo: link.ativo, expiraEm: link.expiraEm?.toISOString() ?? null }
                  : null
              }
            />
          </CardHeader>
        </Card>
      )}

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
      />
    </div>
  );
}
