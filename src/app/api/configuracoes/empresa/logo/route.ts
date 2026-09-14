import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { salvarArquivo, lerArquivo, existeArquivo } from "@/lib/storage";
import { dadosEmpresa } from "@/modules/configuracoes/empresa/queries";

const MAX = 4 * 1024 * 1024; // 4 MB de entrada — é um logo, não uma foto
/** Logo entra em cabeçalho de PDF em tamanho pequeno — não precisa de mais que isso. */
const LADO_MAX = 600;

/**
 * Upload do logo pro timbrado (mesmo padrão de `/api/avisos/imagem`: normaliza e devolve o
 * caminho, quem persiste em `ConfigSistema` é a action `salvarDadosEmpresa`). PNG, não JPEG —
 * um logo pode ter fundo transparente, e um timbrado com fundo branco forçado destoa do PDF.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await can(session.user, "configuracoes", "gerir"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  // Só PNG/JPEG — sharp lê SVG só com libvips com suporte a librsvg, não confirmado neste build.
  if (file.type !== "image/png" && file.type !== "image/jpeg") {
    return NextResponse.json({ error: "Envie um PNG ou JPG." }, { status: 400 });
  }
  if (file.size > MAX) return NextResponse.json({ error: "Imagem muito grande (máx 4 MB)." }, { status: 400 });

  try {
    const entrada = Buffer.from(await file.arrayBuffer());
    const png = await sharp(entrada)
      .rotate()
      .resize(LADO_MAX, LADO_MAX, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    const rel = `empresa/logo-${randomBytes(12).toString("hex")}.png`;
    const salvo = await salvarArquivo(rel, png);
    return NextResponse.json({ caminho: salvo.caminho });
  } catch {
    return NextResponse.json({ error: "Não foi possível processar a imagem." }, { status: 400 });
  }
}

/** Serve o logo atual (qualquer usuário logado — aparece em PDF que o próprio funcionário baixa). */
export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Não autenticado.", { status: 401 });
  const dados = await dadosEmpresa();
  if (!dados?.logoPath || !(await existeArquivo(dados.logoPath))) {
    return new Response("Não encontrado.", { status: 404 });
  }
  const buf = await lerArquivo(dados.logoPath);
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=300" },
  });
}
