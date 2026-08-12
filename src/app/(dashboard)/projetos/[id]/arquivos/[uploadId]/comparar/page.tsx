import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { acessoGlobal } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { revisoesDoDocumento } from "@/modules/uploads/queries";
import { ComparadorRevisoes } from "@/components/projetos/comparador-revisoes";

export const metadata: Metadata = { title: "Comparar revisões" };

/**
 * Comparador de revisões (itens 4 e 5) — rota própria, não dialog dentro do `PdfViewer`: um
 * dialog ali significaria 3 documentos pdf.js abertos ao mesmo tempo (o do viewer + A + B) na
 * página mais pesada do sistema. Mesmo gate de leitura da `visualizar/page.tsx`.
 */
export default async function CompararPage({ params }: { params: Promise<{ id: string; uploadId: string }> }) {
  const user = await requirePermission("projetos", "ver");
  const { id, uploadId } = await params;

  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
    select: {
      id: true,
      nomeArquivo: true,
      documentoId: true,
      disciplinaId: true,
      // Lixeira: `Upload` não está no filtro global (lib/prisma.ts) → checagem explícita,
      // igual à rota de download.
      excluidoEm: true,
      disciplina: {
        select: {
          projetoId: true,
          responsaveis: { select: { userId: true } },
        },
      },
    },
  });
  if (!upload || upload.excluidoEm || upload.disciplina.projetoId !== id) notFound();

  const membros = await prisma.projetoMembro.findMany({ where: { projetoId: id }, select: { userId: true } });
  const ehGlobal = acessoGlobal(user);
  const ehResp = upload.disciplina.responsaveis.some((r) => r.userId === user.id);
  const ehMembro = membros.some((m) => m.userId === user.id);
  if (!ehGlobal && !ehResp && !ehMembro) notFound();

  const revisoes = upload.documentoId ? await revisoesDoDocumento(upload.documentoId) : [];
  // Sem documentoId (linha legada) ou só 1 versão: nada pra comparar.
  if (revisoes.length < 2) notFound();

  return (
    <ComparadorRevisoes
      projetoId={id}
      uploadIdOrigem={uploadId}
      nomeArquivo={upload.nomeArquivo}
      revisoes={revisoes}
    />
  );
}
