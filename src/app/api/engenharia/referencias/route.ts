import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/session";
import { podeIncluirBiblioteca } from "@/modules/engenharia/acesso";
import { salvarArquivo, nomeArquivoLimpo } from "@/lib/storage";

const MAX = 50 * 1024 * 1024;

/** Recebe o anexo de uma referência técnica e devolve a metadata p/ a action persistir. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  if (user.mustChangePassword || !user.ativo) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }
  if (!(await podeIncluirBiblioteca(user))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  // Mesmo motivo das rotas de normas/padrões: exceção sem tratamento vira 500 sem corpo.
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
    if (file.size > MAX) return NextResponse.json({ error: "Arquivo muito grande (máx 50 MB)." }, { status: 400 });

    const nome = nomeArquivoLimpo(file.name || "referencia");
    const ext = nome.includes(".") ? nome.slice(nome.lastIndexOf(".")) : "";
    const rel = `engenharia/referencias/${randomBytes(12).toString("hex")}${ext}`;
    const salvo = await salvarArquivo(rel, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({
      caminho: salvo.caminho,
      nomeArquivo: nome,
      mime: file.type || "application/octet-stream",
      tamanho: salvo.tamanho,
      hashSha256: salvo.hashSha256,
    });
  } catch (e) {
    console.error("[engenharia/referencias] falha no upload:", e);
    return NextResponse.json(
      { error: "Falha ao receber o arquivo. Tente novamente; se persistir, avise o suporte." },
      { status: 500 },
    );
  }
}
