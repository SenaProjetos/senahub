import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { salvarArquivo, nomeArquivoLimpo } from "@/lib/storage";

const MAX = 15 * 1024 * 1024; // 15 MB

/** Upload de anexo de chat. Retorna metadados p/ enviarMensagem persistir. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  if (user.mustChangePassword || !user.ativo) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const form = await req.formData();
  const canalId = String(form.get("canalId") ?? "");
  const file = form.get("file");
  if (!canalId || !(file instanceof File)) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }
  if (file.size > MAX) return NextResponse.json({ error: "Arquivo muito grande (máx 15 MB)." }, { status: 400 });

  const membro = await prisma.canalMembro.findUnique({
    where: { canalId_userId: { canalId, userId: user.id } },
  });
  if (!membro) return NextResponse.json({ error: "Você não participa deste canal." }, { status: 403 });

  const nome = nomeArquivoLimpo(file.name || "arquivo");
  const ext = nome.includes(".") ? nome.slice(nome.lastIndexOf(".")) : "";
  const rel = `chat/${canalId}/${randomBytes(12).toString("hex")}${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await salvarArquivo(rel, buf);

  return NextResponse.json({
    anexoPath: rel,
    anexoNome: nome,
    anexoMime: file.type || "application/octet-stream",
  });
}
