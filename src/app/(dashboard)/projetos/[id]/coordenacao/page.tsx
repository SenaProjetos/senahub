import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Boxes } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { modelosCoordenacao, apontamentosDoProjeto, dashboardApontamentos } from "@/modules/coordenacao/queries";
import { contarPorStatus, contarPorDisciplina, semanasCriadosEncerrados } from "@/modules/coordenacao/dashboard";
import { opcoesTarefa } from "@/modules/tarefas/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { EmptyState } from "@/components/ui/empty-state";
import { ConversaoStatusView } from "@/components/coordenacao/conversao-status-view";
import { CoordenacaoView } from "@/components/coordenacao/coordenacao-view";
import { DashboardCoordenacao } from "@/components/coordenacao/dashboard-coordenacao";

export const metadata: Metadata = { title: "Coordenação" };

export default async function CoordenacaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ apontamento?: string }>;
}) {
  const user = await requirePermission("coordenacao", "ver");
  const { id } = await params;
  const sp = await searchParams;
  const projeto = await projetoVisivel(user, id);
  if (!projeto) notFound();

  const [modelos, podeGerir, apontamentos, minhasDisciplinas, resumoDashboard] = await Promise.all([
    modelosCoordenacao(id),
    can(user.role, "coordenacao", "gerir"),
    apontamentosDoProjeto(id),
    prisma.disciplinaResponsavel.findMany({
      where: { userId: user.id, disciplina: { projetoId: id } },
      select: { disciplinaId: true },
    }),
    dashboardApontamentos(id),
  ]);

  if (modelos.length === 0) {
    return (
      <EmptyState
        icon={Boxes}
        title="Nenhum modelo IFC neste projeto"
        description="Envie o modelo .ifc de cada disciplina na aba Arquivos para montar a maquete federada."
      />
    );
  }

  const rows = modelos.map((m) => ({
    tipo: m.tipo,
    uploadId: m.uploadId,
    disciplinaId: m.disciplinaId,
    disciplinaNome: m.disciplinaNome,
    nomeArquivo: m.nomeArquivo,
    versao: m.versao,
    tamanho: m.tamanho,
    enviadoEm: m.enviadoEm.toISOString(),
    conversao: m.conversao
      ? {
          status: m.conversao.status,
          progresso: m.conversao.progresso,
          tamanhoFrag: m.conversao.tamanhoFrag,
          erro: m.conversao.erro,
        }
      : null,
  }));
  const temConvertido = rows.some((r) => r.conversao?.status === "concluido");

  // Janela de confirmação da tarefa (só quem gerencia coordenação envia apontamentos).
  const [colunasTarefa, opcoes] = podeGerir
    ? await Promise.all([
        prisma.tarefaStatus.findMany({
          where: { ativo: true },
          orderBy: { ordem: "asc" },
          select: { id: true, nome: true },
        }),
        opcoesTarefa(),
      ])
    : [[], null];

  return (
    <div className="space-y-6">
      {temConvertido ? (
        <CoordenacaoView
          modelos={rows}
          apontamentosIniciais={apontamentos}
          projetoId={id}
          projetoCodigo={formatarCodigo(projeto.codigo)}
          projetoNome={projeto.nome}
          currentUserId={user.id}
          ehAdmin={user.role === "admin"}
          podeGerir={podeGerir}
          minhasDisciplinas={minhasDisciplinas.map((d) => d.disciplinaId)}
          colunasTarefa={colunasTarefa}
          opcoesTarefa={opcoes}
          apontamentoInicialNumero={sp.apontamento ? Number(sp.apontamento) : null}
        />
      ) : (
        <EmptyState
          icon={Boxes}
          title="Nenhum modelo convertido ainda"
          description="Converta os IFCs abaixo para montar a maquete federada 3D."
        />
      )}
      {resumoDashboard.length > 0 && (
        <div className="space-y-3">
          <div>
            <h3 className="text-lg font-semibold">Painel de apontamentos</h3>
            <p className="text-sm text-muted-foreground">Status, disciplina e evolução semanal.</p>
          </div>
          <DashboardCoordenacao
            status={contarPorStatus(resumoDashboard)}
            disciplinas={contarPorDisciplina(resumoDashboard)}
            semanas={semanasCriadosEncerrados(resumoDashboard)}
          />
        </div>
      )}
      <div className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold">Modelos e conversões</h3>
          <p className="text-sm text-muted-foreground">
            Última versão do IFC de cada disciplina. Novos envios convertem automaticamente.
          </p>
        </div>
        <ConversaoStatusView podeGerir={podeGerir} modelos={rows} />
      </div>
    </div>
  );
}
