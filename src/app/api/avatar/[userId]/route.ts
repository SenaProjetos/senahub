import { getSession } from "@/lib/session";
import { lerArquivo, existeArquivo } from "@/lib/storage";

/** Serve o avatar (PNG) de um usuário. Requer sessão (avatares só p/ usuários logados). */
export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Não autenticado", { status: 401 });
  const { userId } = await params;
  const rel = `avatars/${userId}.png`;
  if (!(await existeArquivo(rel))) return new Response("Não encontrado", { status: 404 });
  const buf = await lerArquivo(rel);
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=300" },
  });
}
