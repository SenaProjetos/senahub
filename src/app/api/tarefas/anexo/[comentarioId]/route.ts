import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { lerArquivo, existeArquivo } from "@/lib/storage";

/** Serve o anexo de um comentário de tarefa (internos). */
export async function GET(_req: Request, { params }: { params: Promise<{ comentarioId: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Não autenticado", { status: 401 });
  if (session.user.role === "cliente") return new Response("Sem acesso", { status: 403 });
  const { comentarioId } = await params;
  const c = await prisma.tarefaComentario.findUnique({
    where: { id: comentarioId },
    select: { anexoPath: true, anexoNome: true, anexoMime: true },
  });
  if (!c || !c.anexoPath || !(await existeArquivo(c.anexoPath))) return new Response("Não encontrado", { status: 404 });
  const buf = await lerArquivo(c.anexoPath);
  const mime = c.anexoMime ?? "application/octet-stream";
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `${mime.startsWith("image/") ? "inline" : "attachment"}; filename="${encodeURIComponent(c.anexoNome ?? "anexo")}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
