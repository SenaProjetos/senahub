import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { acessoGlobal } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { pendenciasDoUpload } from "@/modules/projetos/pendencias/queries";
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
      disciplinaId: true,
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
  // O upload precisa existir E pertencer ao projeto da URL.
  if (!upload || upload.disciplina.projetoId !== id) notFound();

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

  const podeValidar = await can(user.role, "uploads", "validar");
  const pendencias = await pendenciasDoUpload(uploadId);

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
      finalizada={upload.disciplina.status === "aprovado"}
      podeValidar={podeValidar}
      ehResponsavel={ehResp}
      ehAdmin={user.role === "admin"}
      currentUserId={user.id}
      pendenciasIniciais={pendencias}
      colunasTarefa={colunasTarefa}
      opcoesTarefa={opcoes}
      responsaveisPadrao={responsaveisPadrao}
      paginaInicial={sp.pagina ? Number(sp.pagina) : null}
      pinInicial={sp.pin ? Number(sp.pin) : null}
    />
  );
}
