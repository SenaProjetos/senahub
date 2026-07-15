import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/session";
import { podeIncluirBiblioteca } from "@/modules/engenharia/acesso";
import { salvarArquivo, nomeArquivoLimpo } from "@/lib/storage";

const MAX = 50 * 1024 * 1024;

/** Recebe o arquivo de um padrão técnico e devolve a metadata p/ a action persistir. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  if (user.mustChangePassword || !user.ativo) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }
  if (!(await podeIncluirBiblioteca(user.role))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Arquivo muito grande (máx 50 MB)." }, { status: 400 });

  const nome = nomeArquivoLimpo(file.name || "arquivo");
  const ext = nome.includes(".") ? nome.slice(nome.lastIndexOf(".")) : "";
  const rel = `engenharia/padroes/${randomBytes(12).toString("hex")}${ext}`;
  const salvo = await salvarArquivo(rel, Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({
    caminho: salvo.caminho,
    nomeArquivo: nome,
    mime: file.type || "application/octet-stream",
    tamanho: salvo.tamanho,
    hashSha256: salvo.hashSha256,
  });
}
