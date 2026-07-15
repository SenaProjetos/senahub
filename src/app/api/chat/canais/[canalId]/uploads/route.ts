import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export type UploadChatItem = {
  id: string;
  nomeArquivo: string;
  mimeType: string | null;
  disciplina: string;
};

/**
 * Lista os arquivos (uploads) do projeto vinculado ao canal, para anexar no chat
 * sem reenviar. Exige participar do canal; só devolve arquivos do próprio projeto.
 */
export async function GET(req: Request, ctx: { params: Promise<{ canalId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { canalId } = await ctx.params;

  const membro = await prisma.canalMembro.findUnique({
    where: { canalId_userId: { canalId, userId: session.user.id } },
  });
  if (!membro) return NextResponse.json({ error: "Você não participa deste canal." }, { status: 403 });

  const canal = await prisma.canal.findUnique({
    where: { id: canalId },
    select: { projetoId: true, disciplina: { select: { projetoId: true } } },
  });
  const projetoId = canal?.projetoId ?? canal?.disciplina?.projetoId ?? null;
  if (!projetoId) return NextResponse.json({ uploads: [], semProjeto: true });

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  const uploads = await prisma.upload.findMany({
    where: {
      excluidoEm: null,
      disciplina: { projetoId },
      ...(q ? { nomeArquivo: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      nomeArquivo: true,
      mimeType: true,
      disciplina: { select: { nome: true } },
    },
  });

  const itens: UploadChatItem[] = uploads.map((u) => ({
    id: u.id,
    nomeArquivo: u.nomeArquivo,
    mimeType: u.mimeType,
    disciplina: u.disciplina.nome,
  }));
  return NextResponse.json({ uploads: itens });
}
