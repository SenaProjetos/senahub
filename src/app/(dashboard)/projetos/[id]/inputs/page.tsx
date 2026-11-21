import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { obterProjeto } from "@/modules/projetos/queries";
import {
  listarInputs,
  listarInputsRemovidos,
  linkInput,
  progressoInputs,
  obterBriefing,
  resumoPortalBriefing,
} from "@/modules/inputs/queries";
import { resolverModeloDoProjeto, modelosParaEscolha } from "@/modules/inputs/modelo-queries";
import {
  secoesDoProjeto,
  prePopularRespostas,
  calcularStatusBriefing,
  type StatusBriefing,
} from "@/modules/inputs/briefing-schema";
import { InputsPanel } from "@/components/inputs/inputs-panel";
import { PortalBriefingCard } from "@/components/inputs/portal-briefing-card";
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

  const [podeGerir, projetoCompleto, inputs, removidos, link, progresso, briefing, resumoPortal] = await Promise.all([
    can(user, "projetos", "gerir"),
    obterProjeto(user, id),
    listarInputs(id),
    // Removidas só servem para restaurar — quem não gere nem consulta.
    can(user, "projetos", "gerir").then((pode) => (pode ? listarInputsRemovidos(id) : [])),
    linkInput(id),
    progressoInputs(id),
    obterBriefing(id),
    // Só a equipe que gere vê (e usa) o bloco do portal.
    can(user, "projetos", "gerir").then((pode) => (pode ? resumoPortalBriefing(id) : null)),
  ]);
  if (!projetoCompleto) notFound();

  const modelo = await resolverModeloDoProjeto(id, briefing?.modeloId);
  const modelosEscolha = podeGerir ? await modelosParaEscolha(modelo.id) : [];

  const baseUrl = process.env.APP_URL ?? "";
  const disciplinas = projetoCompleto.disciplinas.map((d) => d.disciplinaTextoLegado);

  // Respostas do briefing + pré-população do cadastro (sem sobrescrever o já preenchido).
  const respostasSalvas = (briefing?.respostasJson as Record<string, unknown> | null) ?? {};
  const cliente = projetoCompleto.cliente;
  const respostasIniciais = prePopularRespostas(respostasSalvas, {
    nome: cliente?.nome,
    email: cliente?.email,
    telefone: cliente?.telefone,
    endereco: projetoCompleto.endereco ?? undefined,
  }, modelo.secoes);
  const ocultos = { secoes: briefing?.secoesOcultas ?? [], campos: briefing?.camposOcultos ?? [] };
  // Calculado ao ler, sobre o que ESTE projeto mostra (disciplinas + ocultações): o gravado fica defasado quando uma
  // disciplina entra ou sai do projeto.
  const statusBriefing: StatusBriefing = calcularStatusBriefing(respostasSalvas, secoesDoProjeto(modelo.secoes, disciplinas, ocultos));

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
  const descricaoLink =
    resumoPortal?.situacao === "encerrado"
      ? `${situacaoLink} Encerrado no portal: o link também não aceita respostas.`
      : situacaoLink;

  return (
    <div className="space-y-4">
      {podeGerir && resumoPortal && <PortalBriefingCard projetoId={id} resumo={resumoPortal} />}

      {podeGerir && (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div className="min-w-0">
              <CardTitle className="text-base">Link para quem não tem conta no portal</CardTitle>
              <CardDescription>{descricaoLink}</CardDescription>
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
        ocultos={ocultos}
        modeloSecoes={modelo.secoes}
        modelo={{ id: modelo.id, nome: modelo.nome, invalido: modelo.invalido === true, origem: modelo.origem }}
        modelosEscolha={modelosEscolha}
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
        removidos={removidos.map((i) => ({
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
