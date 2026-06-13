import { NextResponse } from "next/server";
import sharp from "sharp";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { salvarArquivo } from "@/lib/storage";

const MAX = 5 * 1024 * 1024; // 5 MB

/** Upload do avatar do próprio usuário: redimensiona p/ 256×256 (sharp) e grava no storage. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  if (user.mustChangePassword || !user.ativo) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Envie uma imagem." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Imagem muito grande (máx 5 MB)." }, { status: 400 });

  try {
    const entrada = Buffer.from(await file.arrayBuffer());
    const png = await sharp(entrada).rotate().resize(256, 256, { fit: "cover" }).png().toBuffer();
    await salvarArquivo(`avatars/${user.id}.png`, png);
    const url = `/api/avatar/${user.id}?v=${Date.now()}`;
    await prisma.user.update({ where: { id: user.id }, data: { image: url } });
    await logAudit({ userId: user.id, modulo: "usuarios", acao: "alterar-avatar", entidade: "User", entidadeId: user.id });
    return NextResponse.json({ ok: true, image: url });
  } catch {
    return NextResponse.json({ error: "Não foi possível processar a imagem." }, { status: 400 });
  }
}
