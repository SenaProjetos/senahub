import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { lerArquivo, existeArquivo } from "@/lib/storage";

/** Serve o anexo de uma mensagem. Requer ser membro do canal. */
export async function GET(_req: Request, { params }: { params: Promise<{ mensagemId: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Não autenticado", { status: 401 });
  const { mensagemId } = await params;

  const msg = await prisma.mensagem.findUnique({
    where: { id: mensagemId },
    select: { canalId: true, anexoPath: true, anexoNome: true, anexoMime: true },
  });
  if (!msg || !msg.anexoPath) return new Response("Não encontrado", { status: 404 });

  const ehGlobal = session.user.role === "admin" || session.user.role === "supervisor";
  if (!ehGlobal) {
    const membro = await prisma.canalMembro.findUnique({
      where: { canalId_userId: { canalId: msg.canalId, userId: session.user.id } },
    });
    if (!membro) return new Response("Sem acesso", { status: 403 });
  }
  if (!(await existeArquivo(msg.anexoPath))) return new Response("Arquivo ausente", { status: 404 });

  const buf = await lerArquivo(msg.anexoPath);
  const mime = msg.anexoMime ?? "application/octet-stream";
  const inline = mime.startsWith("image/");
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(msg.anexoNome ?? "anexo")}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
