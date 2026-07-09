import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { guardarChunk } from "@/lib/upload-chunks";

/**
 * Recebe UM pedaço de um upload chunked. Metadados vão na query (sessão, índice,
 * total) e os bytes no corpo cru — evita o overhead de multipart em cada pedaço.
 * Cada pedaço fica bem abaixo do teto de 100 MB do Cloudflare Tunnel.
 * A finalização (montagem + regra de negócio) acontece em /api/uploads e
 * /api/documentos, que passam a aceitar `sessaoId`.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  if (user.mustChangePassword || !user.ativo) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const sessaoId = String(searchParams.get("sessao") ?? "");
  const indice = Number(searchParams.get("i"));
  const total = Number(searchParams.get("n"));
  if (!sessaoId) return NextResponse.json({ error: "Sessão ausente." }, { status: 400 });

  let chunk: Buffer;
  try {
    chunk = Buffer.from(await req.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Falha ao receber o pedaço." }, { status: 413 });
  }
  if (chunk.length === 0) return NextResponse.json({ error: "Pedaço vazio." }, { status: 400 });

  try {
    await guardarChunk({ userId: user.id, sessaoId, indice, total, chunk });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, recebido: indice });
}
