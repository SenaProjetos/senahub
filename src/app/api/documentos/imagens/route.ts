import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { logAudit, getClientIp } from "@/lib/audit";
import { salvarArquivo, nomeArquivoLimpo } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MAX = 8 * 1024 * 1024; // 8 MB — logos/carimbos/fotos

/**
 * Upload de imagem (logo/carimbo/foto) para usar no elemento `imagem` do
 * Estúdio de Documentos. Reencoda para JPEG, removendo conteúdo ativo e fazendo
 * o tipo persistido derivar dos bytes processados, não do navegador.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  if (user.mustChangePassword || !user.ativo) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }
  if (!(await can(user, "documentos", "gerir"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }
  if (file.size > MAX) {
    return NextResponse.json({ error: "Imagem muito grande (máx 8 MB)." }, { status: 400 });
  }

  const nome = nomeArquivoLimpo(file.name || "imagem");
  const extOriginal = nome.includes(".") ? nome.slice(nome.lastIndexOf(".") + 1).toLowerCase() : "";
  if (file.type === "image/svg+xml" || extOriginal === "svg") {
    return NextResponse.json({ error: "SVG não é aceito. Envie PNG, JPG ou WEBP." }, { status: 415 });
  }

  let buf: Buffer;
  try {
    buf = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "A imagem enviada é inválida." }, { status: 415 });
  }

  const rel = `documentos/imagens/${randomBytes(16).toString("hex")}.jpg`;
  await salvarArquivo(rel, buf);

  // Nome do arquivo (sem o prefixo da pasta) é o id servível da rota GET.
  const arquivo = rel.slice("documentos/imagens/".length);
  const url = `/api/documentos/imagens/${encodeURIComponent(arquivo)}`;

  await logAudit({
    userId: user.id,
    modulo: "documentos",
    acao: "upload-imagem",
    resultado: "sucesso",
    entidade: "DocumentoImagem",
    entidadeId: arquivo,
    detalhe: { nome, tamanho: buf.length, mime: "image/jpeg" },
    ip: await getClientIp(),
  });

  return NextResponse.json({ url, caminho: rel });
}
