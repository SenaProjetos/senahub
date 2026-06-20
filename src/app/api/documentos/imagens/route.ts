import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { logAudit, getClientIp } from "@/lib/audit";
import { salvarArquivo, nomeArquivoLimpo } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MAX = 8 * 1024 * 1024; // 8 MB — logos/carimbos/fotos

// Tipos aceitos → extensão canônica usada ao salvar.
const TIPOS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

const EXT_VALIDAS = new Set(["png", "jpg", "jpeg", "webp", "svg"]);

/**
 * Upload de imagem (logo/carimbo/foto) para usar no elemento `imagem` do
 * Estúdio de Documentos. Salva via lib/storage em "documentos/imagens" e
 * retorna a URL servível (rota GET abaixo). Requer documentos:gerir.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  if (user.mustChangePassword || !user.ativo) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }
  if (!(await can(user.role, "documentos", "gerir"))) {
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
  // Aceita por mime OU por extensão (alguns navegadores não setam mime de SVG).
  const extPorMime = TIPOS[file.type];
  if (!extPorMime && !EXT_VALIDAS.has(extOriginal)) {
    return NextResponse.json(
      { error: "Formato inválido. Use PNG, JPG, WEBP ou SVG." },
      { status: 415 },
    );
  }
  const ext = extPorMime ?? (extOriginal === "jpeg" ? "jpg" : extOriginal);

  const rel = `documentos/imagens/${randomBytes(16).toString("hex")}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
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
    detalhe: { nome, tamanho: buf.length, mime: file.type || null },
    ip: await getClientIp(),
  });

  return NextResponse.json({ url, caminho: rel });
}
