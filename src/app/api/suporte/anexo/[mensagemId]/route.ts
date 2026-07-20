import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { lerArquivo, existeArquivo } from "@/lib/storage";
import { HR_ADMIN_ROLES } from "@/lib/roles";

/** Serve o anexo de uma mensagem de ticket (autor do ticket ou gestor). */
export async function GET(_req: Request, { params }: { params: Promise<{ mensagemId: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Não autenticado", { status: 401 });
  const { mensagemId } = await params;
  const m = await prisma.ticketMensagem.findUnique({
    where: { id: mensagemId },
    select: { anexoPath: true, anexoNome: true, anexoMime: true, ticket: { select: { autorId: true } } },
  });
  if (!m || !m.anexoPath) return new Response("Não encontrado", { status: 404 });

  const ehGestor = session.user.role === "admin" || HR_ADMIN_ROLES.includes(session.user.role);
  if (!ehGestor && m.ticket.autorId !== session.user.id) return new Response("Sem acesso", { status: 403 });
  if (!(await existeArquivo(m.anexoPath))) return new Response("Arquivo ausente", { status: 404 });

  const buf = await lerArquivo(m.anexoPath);
  const mime = m.anexoMime ?? "application/octet-stream";
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `${mime.startsWith("image/") || mime.startsWith("video/") ? "inline" : "attachment"}; filename="${encodeURIComponent(m.anexoNome ?? "anexo")}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
