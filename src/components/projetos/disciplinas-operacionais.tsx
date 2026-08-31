import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { CLT_ROLES, INTERNAL_ROLES } from "@/lib/roles";
import {
  catalogoDisciplinas,
  disciplinasForaDeSLA,
  nomesUsuarios,
  obterProjeto,
  SLA_VALIDACAO_DIAS,
  usuariosInternos,
} from "@/modules/projetos/queries";
import { disciplinaUsaPastas } from "@/modules/projetos/estrutura-tipo";
import { tarefasDoProjeto, opcoesTarefa, colunasTarefaAtivas, tarefaBloqueada } from "@/modules/tarefas/queries";
import { canalDoProjeto, canaisDasDisciplinas } from "@/modules/chat/queries";
import { AdicionarDisciplinaButton } from "@/components/projetos/adicionar-disciplina-button";
import { AdicionarDoCatalogoButton } from "@/components/projetos/adicionar-do-catalogo-button";
import { DisciplinaCard, type TarefaDaDisciplina } from "@/components/projetos/disciplina-card";
import { DisciplinasKanban } from "@/components/projetos/disciplinas-kanban";

/** Área operacional preservada da ficha anterior, agora isolada na aba Disciplinas. */
export async function DisciplinasOperacionais({ projetoId }: { projetoId: string }) {
  const user = await requirePermission("projetos", "ver");
  const projeto = await obterProjeto(user, projetoId);
  if (!projeto) notFound();

  const [podeGerir, podeValidar] = await Promise.all([
    can(user, "projetos", "gerir"),
    can(user, "uploads", "validar"),
  ]);
  const [internos, catalogo, slaFora, canalChat, canaisDisc] = await Promise.all([
    podeGerir ? usuariosInternos() : Promise.resolve([]),
    podeGerir ? catalogoDisciplinas() : Promise.resolve([]),
    podeValidar ? disciplinasForaDeSLA(user) : Promise.resolve([]),
    canalDoProjeto(projeto.id),
    canaisDasDisciplinas(projeto.id),
  ]);

  const ocultarValorDisciplina = CLT_ROLES.includes(user.role);
  const solicitantesIds = [
    ...new Set(projeto.disciplinas.map((disciplina) => disciplina.aprovacaoSolicitadaPorId).filter((id): id is string => !!id)),
  ];
  const solicitantes = await nomesUsuarios(solicitantesIds);
  const nomeSolicitante = new Map(solicitantes.map((solicitante) => [solicitante.id, solicitante.name]));

  const disciplinas = projeto.disciplinas.map((disciplina) => {
    const usaPastas = disciplinaUsaPastas(disciplina.pastas);
    const uploadsPacote = disciplina.uploads.filter((upload) => upload.pastaId == null);
    const uploadsPasta = disciplina.uploads.filter((upload) => upload.pastaId != null);
    const uploads = uploadsPacote.map((upload) => ({
      id: upload.id,
      pacote: upload.pacote as "A" | "B" | "OUTROS" | "RECEBIDOS",
      nomeArquivo: upload.nomeArquivo,
      versao: upload.versao,
      tamanho: upload.tamanho,
      validado: upload.validado,
      origem: upload.origem,
      ajusteObs: upload.revisaoObs,
      ajusteEm: upload.revisaoEm ? new Date(upload.revisaoEm).toISOString() : null,
      autor: upload.autor.name,
      data: new Date(upload.createdAt).toISOString(),
      aceiteToken: upload.aceite?.token ?? null,
      aceiteSituacao: upload.aceite?.situacao ?? null,
      aceiteExpiraEm: upload.aceite?.expiraEm?.toISOString() ?? null,
      aceiteRevogadoEm: upload.aceite?.revogadoEm?.toISOString() ?? null,
    }));
    return {
      id: disciplina.id,
      nome: disciplina.disciplinaTextoLegado,
      catalogoNome: disciplina.catalogo?.nome ?? null,
      status: disciplina.status,
      prazo: disciplina.prazo ? new Date(disciplina.prazo).toISOString() : null,
      valor: ocultarValorDisciplina ? null : disciplina.valor != null ? Number(disciplina.valor) : null,
      responsaveis: disciplina.responsaveis.map((responsavel) => ({ userId: responsavel.userId, name: responsavel.user.name, role: responsavel.user.role })),
      ehResponsavel: disciplina.responsaveis.some((responsavel) => responsavel.userId === user.id),
      revisoes: disciplina.revisoes.map((revisao) => ({
        id: revisao.id,
        numero: revisao.numero,
        motivo: revisao.motivo,
        autor: revisao.autor.name,
        data: new Date(revisao.createdAt).toISOString(),
      })),
      uploads,
      temA: uploads.some((upload) => upload.pacote === "A"),
      temB: uploads.some((upload) => upload.pacote === "B"),
      jaValidado: disciplina.status === "aprovado",
      temPagamento: disciplina._count.pagamentos > 0,
      exigePacoteA: disciplina.exigePacoteA,
      exigePacoteB: disciplina.exigePacoteB,
      usaPastas,
      pastas: disciplina.pastas,
      arquivosPasta: uploadsPasta.map((upload) => ({
        id: upload.id,
        nome: upload.nomeArquivo,
        pastaId: upload.pastaId!,
        versao: upload.versao,
        tamanho: upload.tamanho,
        autor: upload.autor.name,
        data: new Date(upload.createdAt).toISOString(),
        downloadUrl: `/api/uploads/${upload.id}/download`,
      })),
      aprovacaoSolicitadaEm: disciplina.aprovacaoSolicitadaEm ? disciplina.aprovacaoSolicitadaEm.toISOString() : null,
      aprovacaoSolicitadaPorNome: disciplina.aprovacaoSolicitadaPorId
        ? (nomeSolicitante.get(disciplina.aprovacaoSolicitadaPorId) ?? null)
        : null,
    };
  });

  const podeVerTarefas = INTERNAL_ROLES.includes(user.role);
  let tarefaColunas: { id: string; nome: string }[] | null = null;
  let tarefaOpcoes: Awaited<ReturnType<typeof opcoesTarefa>> | null = null;
  let tarefasProjeto: Awaited<ReturnType<typeof tarefasDoProjeto>> = [];
  if (podeVerTarefas) {
    [tarefaColunas, tarefaOpcoes, tarefasProjeto] = await Promise.all([
      colunasTarefaAtivas(),
      opcoesTarefa(user),
      tarefasDoProjeto(user, projeto.id),
    ]);
    if (!tarefaOpcoes.projetos.some((projetoOpcao) => projetoOpcao.id === projeto.id)) {
      tarefaOpcoes.projetos.unshift({ id: projeto.id, codigo: projeto.codigo, nome: projeto.nome });
    }
    for (const disciplina of projeto.disciplinas) {
      if (!tarefaOpcoes.disciplinas.some((opcao) => opcao.id === disciplina.id)) {
        tarefaOpcoes.disciplinas.push({ id: disciplina.id, nome: disciplina.disciplinaTextoLegado, projetoId: projeto.id });
      }
    }
  }

  const tarefasPorDisciplina = new Map<string, TarefaDaDisciplina[]>();
  for (const tarefa of tarefasProjeto) {
    if (!tarefa.disciplinaId) continue;
    const item: TarefaDaDisciplina = {
      id: tarefa.id,
      titulo: tarefa.titulo,
      descricao: tarefa.descricao ?? "",
      statusId: tarefa.statusId,
      prazo: tarefa.prazo ? new Date(tarefa.prazo).toISOString().slice(0, 10) : "",
      prioridade: tarefa.prioridade ?? "",
      projetoId: tarefa.projetoId ?? "",
      projetoCodigo: tarefa.projeto?.codigo ?? null,
      projetoNome: tarefa.projeto?.nome ?? null,
      disciplinaId: tarefa.disciplinaId,
      criadorId: tarefa.criadorId,
      responsaveis: tarefa.responsaveis.map((responsavel) => ({ id: responsavel.user.id, nome: responsavel.user.name, image: responsavel.user.image })),
      itens: tarefa.itens.map((itemTarefa) => ({ id: itemTarefa.id, descricao: itemTarefa.descricao, concluido: itemTarefa.concluido })),
      dependeDeIds: tarefa.dependeDe.map((dependencia) => dependencia.dependeDe.id),
      bloqueada: tarefaBloqueada(tarefa),
      comentarios: tarefa.comentarios.map((comentario) => ({
        id: comentario.id,
        autorId: comentario.autorId,
        texto: comentario.texto,
        autor: comentario.autor.name,
        autorImage: comentario.autor.image,
        data: comentario.createdAt.toISOString(),
        anexoMime: comentario.anexoMime,
        anexoNome: comentario.anexoNome,
      })),
      statusNome: tarefa.status.nome,
      statusCor: tarefa.status.cor,
      concluido: tarefa.status.concluido,
    };
    const lista = tarefasPorDisciplina.get(tarefa.disciplinaId);
    if (lista) lista.push(item);
    else tarefasPorDisciplina.set(tarefa.disciplinaId, [item]);
  }

  const disciplinasSla = slaFora.filter((disciplina) => disciplina.projetoId === projeto.id);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Disciplinas</h2>
          <p className="text-sm text-muted-foreground">Gestão operacional, entregas, arquivos, revisões e responsáveis.</p>
        </div>
        {podeGerir && (
          <div className="flex items-center gap-1">
            <AdicionarDisciplinaButton projetoId={projeto.id} internos={internos.map((interno) => ({ id: interno.id, name: interno.name }))} prazoContrato={projeto.prazoPlanejado?.toISOString() ?? null} />
            {catalogo.length > 0 && <AdicionarDoCatalogoButton projetoId={projeto.id} catalogo={catalogo} />}
          </div>
        )}
      </div>

      {disciplinasSla.length > 0 && (
        <div className="flex gap-2 border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p><span className="font-medium">Validação pendente há mais de {SLA_VALIDACAO_DIAS} dias:</span> {disciplinasSla.map((disciplina) => disciplina.disciplinaTextoLegado).join(", ")}</p>
        </div>
      )}

      <DisciplinasKanban projetoId={projeto.id} disciplinas={disciplinas} podeGerir={podeGerir} internos={internos.map((interno) => ({ id: interno.id, name: interno.name }))} />

      <div className="grid gap-3 md:grid-cols-2">
        {disciplinas.map((disciplina) => (
          <DisciplinaCard
            key={disciplina.id}
            projetoId={projeto.id}
            disciplina={disciplina}
            podeGerir={podeGerir}
            podeValidar={podeValidar}
            internos={internos}
            canalChatId={canaisDisc.get(disciplina.id) ?? canalChat?.id}
            tarefas={tarefasPorDisciplina.get(disciplina.id) ?? []}
            tarefaOpcoes={tarefaOpcoes ?? undefined}
            tarefaColunas={tarefaColunas ?? undefined}
            meId={user.id}
            meRole={user.role}
          />
        ))}
      </div>
    </div>
  );
}
