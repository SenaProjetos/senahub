import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { lerArquivo, existeArquivo } from "@/lib/storage";
import { escopoTarefa } from "@/modules/tarefas/queries";

/** Serve o anexo de um comentário de tarefa (internos). */
export async function GET(_req: Request, { params }: { params: Promise<{ comentarioId: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Não autenticado", { status: 401 });
  if (session.user.role === "cliente") return new Response("Sem acesso", { status: 403 });
  const { comentarioId } = await params;
  const c = await prisma.tarefaComentario.findFirst({
    where: { id: comentarioId, tarefa: escopoTarefa(session.user) },
    select: { anexoPath: true, anexoNome: true, anexoMime: true },
  });
  if (!c || !c.anexoPath || !(await existeArquivo(c.anexoPath))) return new Response("Não encontrado", { status: 404 });
  const buf = await lerArquivo(c.anexoPath);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(c.anexoNome ?? "anexo")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
    },
  });
}
