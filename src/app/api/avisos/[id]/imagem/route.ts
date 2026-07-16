import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { lerArquivo, existeArquivo } from "@/lib/storage";

/** Serve a imagem de um aviso (JPEG). Requer sessão — usada pelo modal do comunicado. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Não autenticado", { status: 401 });
  const { id } = await params;
  const aviso = await prisma.aviso.findUnique({ where: { id }, select: { imagemPath: true } });
  if (!aviso?.imagemPath || !(await existeArquivo(aviso.imagemPath))) {
    return new Response("Não encontrado", { status: 404 });
  }
  const buf = await lerArquivo(aviso.imagemPath);
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=300" },
  });
}
