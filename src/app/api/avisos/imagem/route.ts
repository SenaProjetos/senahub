import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { salvarArquivo } from "@/lib/storage";

const MAX = 8 * 1024 * 1024; // 8 MB de entrada

/**
 * Recebe a imagem de um Aviso Geral, normaliza (sharp: reorienta + limita a 1000px,
 * JPEG) e devolve o caminho relativo p/ a action persistir em `Aviso.imagemPath`.
 * A imagem é enviada ANTES de o aviso existir, por isso o nome é aleatório (sem id).
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  if (user.mustChangePassword || !user.ativo) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }
  if (!(await can(user.role, "avisos", "enviar"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Envie uma imagem." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Imagem muito grande (máx 8 MB)." }, { status: 400 });

  try {
    const entrada = Buffer.from(await file.arrayBuffer());
    const jpg = await sharp(entrada)
      .rotate()
      .resize(1000, 1000, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    const rel = `avisos/${randomBytes(12).toString("hex")}.jpg`;
    const salvo = await salvarArquivo(rel, jpg);
    return NextResponse.json({ caminho: salvo.caminho, mime: "image/jpeg", tamanho: salvo.tamanho });
  } catch {
    return NextResponse.json({ error: "Não foi possível processar a imagem." }, { status: 400 });
  }
}
