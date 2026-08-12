import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { acessoGlobal } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { pendenciasDoUpload, calibracoesDaPrancha, padroesDaDisciplina, novidadesDoDocumento } from "@/modules/projetos/pendencias/queries";
import { pranchasVigentesDisciplina } from "@/modules/uploads/queries";
import { opcoesTarefa } from "@/modules/tarefas/queries";
import { PdfViewer } from "@/components/projetos/pdf-viewer";

export const metadata: Metadata = { title: "Visualizar prancha" };

export default async function VisualizarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; uploadId: string }>;
  searchParams: Promise<{ pagina?: string; pin?: string }>;
}) {
  const user = await requirePermission("projetos", "ver");
  const { id, uploadId } = await params;
  const sp = await searchParams;

  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
    select: {
      id: true,
      nomeArquivo: true,
      mimeType: true,
      pacote: true,
      versao: true,
      validado: true,
      documentoId: true,
      disciplinaId: true,
      // Lixeira: `Upload` não está no filtro global (lib/prisma.ts) → checagem explícita,
      // igual à rota de download.
      excluidoEm: true,
      disciplina: {
        select: {
          nome: true,
          status: true,
          projetoId: true,
          projeto: { select: { id: true, codigo: true, nome: true } },
          responsaveis: { select: { userId: true } },
        },
      },
    },
  });
  // O upload precisa existir, estar fora da lixeira E pertencer ao projeto da URL.
  if (!upload || upload.excluidoEm || upload.disciplina.projetoId !== id) notFound();

  // Mesmo controle de acesso do download: global, responsável da disciplina ou membro do projeto.
  const membros = await prisma.projetoMembro.findMany({
    where: { projetoId: id },
    select: { userId: true },
  });
  const ehGlobal = acessoGlobal(user);
  const ehResp = upload.disciplina.responsaveis.some((r) => r.userId === user.id);
  const ehMembro = membros.some((m) => m.userId === user.id);
  if (!ehGlobal && !ehResp && !ehMembro) notFound();

  // Só a versão vigente do arquivo aceita novos apontamentos.
  const maisNova = await prisma.upload.findFirst({
    where: {
      disciplinaId: upload.disciplinaId,
      pacote: upload.pacote,
      nomeArquivo: upload.nomeArquivo,
      versao: { gt: upload.versao },
    },
    select: { id: true },
  });

  const podeValidar = await can(user, "uploads", "validar");
  // Escopo do documento (todas as revisões): apontamento aberto na R01 continua aparecendo
  // na R02 — carry-over. `versaoAtual` deixa a UI marcar o que veio de revisão anterior.
  const pendencias = await pendenciasDoUpload(uploadId, {
    documentoId: upload.documentoId,
    versaoAtual: upload.versao,
    // Rascunho (item 31) só aparece pra quem escreveu.
    viewerId: user.id,
  });

  // Janela de confirmação da tarefa (só quem valida envia apontamentos).
  const [colunasTarefa, opcoes] = podeValidar
    ? await Promise.all([
        prisma.tarefaStatus.findMany({
          where: { ativo: true },
          orderBy: { ordem: "asc" },
          select: { id: true, nome: true },
        }),
        opcoesTarefa(),
      ])
    : [[], null];
  const responsaveisPadrao = upload.disciplina.responsaveis.map((r) => r.userId);
  // Só mostra o link de comparar quando há de fato outra revisão pra comparar (itens 4/5).
  const temOutraRevisao = upload.documentoId
    ? (await prisma.upload.count({ where: { documentoId: upload.documentoId } })) > 1
    : false;
  // Candidatas a destino do "replicar apontamento" (item 30) — só quem valida aponta mesmo.
  const pranchasParaReplicar = podeValidar ? await pranchasVigentesDisciplina(upload.disciplinaId, uploadId) : [];
  // Escala calibrada por página (item 28) — escopo do documento, então revisão nova herda.
  const calibracoes = await calibracoesDaPrancha(uploadId, upload.documentoId);
  // Biblioteca de apontamentos-padrão (item 10) — só quem aponta usa.
  const padroes = podeValidar ? await padroesDaDisciplina(upload.disciplinaId) : [];
  // "O que mudou desde sua última análise" (item 8). Lido ANTES de o viewer marcar a leitura —
  // a ordem é o que faz o aviso existir; marcar aqui zeraria a novidade na própria visita.
  const novidades = await novidadesDoDocumento(upload.documentoId, user.id);

  return (
    <PdfViewer
      uploadId={upload.id}
      projetoId={id}
      disciplinaId={upload.disciplinaId}
      nomeArquivo={upload.nomeArquivo}
      codigo={formatarCodigo(upload.disciplina.projeto.codigo)}
      projetoNome={upload.disciplina.projeto.nome}
      disciplinaNome={upload.disciplina.nome}
      versao={upload.versao}
      versaoAtual={!maisNova}
      validado={upload.validado}
      finalizada={upload.disciplina.status === "aprovado"}
      podeValidar={podeValidar}
      ehResponsavel={ehResp}
      ehAdmin={user.role === "admin"}
      ehGlobal={ehGlobal}
      currentUserId={user.id}
      pendenciasIniciais={pendencias}
      colunasTarefa={colunasTarefa}
      opcoesTarefa={opcoes}
      responsaveisPadrao={responsaveisPadrao}
      temOutraRevisao={temOutraRevisao}
      documentoId={upload.documentoId}
      pranchasParaReplicar={pranchasParaReplicar}
      calibracoesIniciais={calibracoes}
      padroes={padroes}
      novidades={novidades}
      paginaInicial={sp.pagina ? Number(sp.pagina) : null}
      pinInicial={sp.pin ? Number(sp.pin) : null}
    />
  );
}
