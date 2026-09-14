import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { lerArquivo, existeArquivo } from "@/lib/storage";
import { podeObservarCanal } from "@/modules/chat/acesso";

/** Serve um anexo (múltiplos por mensagem) da tabela MensagemAnexo. Requer ser membro do canal ou poder observá-lo (`podeObservarCanal`). */
export async function GET(_req: Request, { params }: { params: Promise<{ anexoId: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Não autenticado", { status: 401 });
  const { anexoId } = await params;

  const anexo = await prisma.mensagemAnexo.findUnique({
    where: { id: anexoId },
    select: { path: true, nome: true, mime: true, mensagem: { select: { canalId: true, canal: { select: { tipo: true } } } } },
  });
  if (!anexo) return new Response("Não encontrado", { status: 404 });

  if (!podeObservarCanal(session.user.role, anexo.mensagem.canal.tipo)) {
    const membro = await prisma.canalMembro.findUnique({
      where: { canalId_userId: { canalId: anexo.mensagem.canalId, userId: session.user.id } },
    });
    if (!membro) return new Response("Sem acesso", { status: 403 });
  }
  if (!(await existeArquivo(anexo.path))) return new Response("Arquivo ausente", { status: 404 });

  const buf = await lerArquivo(anexo.path);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(anexo.nome ?? "anexo")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
    },
  });
}
