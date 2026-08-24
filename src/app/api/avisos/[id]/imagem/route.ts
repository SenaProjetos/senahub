import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { lerArquivo, existeArquivo } from "@/lib/storage";
import { can } from "@/lib/permissions";

/** Serve a imagem de um aviso (JPEG). Requer sessão — usada pelo modal do comunicado. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Não autenticado", { status: 401 });
  if (session.user.mustChangePassword || !session.user.ativo) return new Response("Sem acesso", { status: 403 });
  const { id } = await params;
  const podeGerir = await can(session.user, "avisos", "enviar");
  const aviso = await prisma.aviso.findFirst({
    where: {
      id,
      OR: [
        { criadoPorId: session.user.id },
        { destinatarios: { some: { userId: session.user.id } } },
        ...(podeGerir ? [{}] : []),
      ],
    },
    select: { imagemPath: true },
  });
  if (!aviso?.imagemPath || !(await existeArquivo(aviso.imagemPath))) {
    return new Response("Não encontrado", { status: 404 });
  }
  const buf = await lerArquivo(aviso.imagemPath);
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=300" },
  });
}
