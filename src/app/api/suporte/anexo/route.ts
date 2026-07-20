import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/session";
import { salvarArquivo, nomeArquivoLimpo } from "@/lib/storage";

// 100 MB — cobre print/vídeo curto demonstrando o problema; teto da borda Cloudflare.
// Esta rota fica FORA do middleware (ver middleware.ts) p/ não bufferizar no teto de 10 MB
// do Next 15.5 — por isso se auto-autentica (sessão + mustChangePassword + ativo).
const MAX = 100 * 1024 * 1024;

/** Upload de anexo de mensagem de ticket de suporte (imagem/vídeo/documento). */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (session.user.mustChangePassword || !session.user.ativo) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Arquivo muito grande (máx 100 MB)." }, { status: 400 });

  const nome = nomeArquivoLimpo(file.name || "arquivo");
  const ext = nome.includes(".") ? nome.slice(nome.lastIndexOf(".")) : "";
  const rel = `suporte/${randomBytes(12).toString("hex")}${ext}`;
  await salvarArquivo(rel, Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ anexoPath: rel, anexoNome: nome, anexoMime: file.type || "application/octet-stream" });
}
