import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { lerArquivo } from "@/lib/storage";

export const dynamic = "force-dynamic";

const PASTA = "documentos/imagens";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
};

/**
 * Serve (inline) uma imagem salva em "documentos/imagens" para uso em <img src>
 * no editor, no preview e no PDF (Puppeteer navega com o cookie de sessão).
 * O segmento `arquivo` é só o nome do arquivo — qualquer separador de caminho
 * é rejeitado (anti path-traversal); o `lib/storage` reforça o confinamento.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ arquivo: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await can(session.user.role, "documentos", "ver"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { arquivo } = await ctx.params;
  const nome = decodeURIComponent(arquivo);
  // Só nome puro: sem separadores nem ".." (defesa em profundidade c/ o storage).
  if (!nome || /[\\/]/.test(nome) || nome.includes("..")) {
    return NextResponse.json({ error: "Caminho inválido." }, { status: 400 });
  }

  const ext = nome.includes(".") ? nome.slice(nome.lastIndexOf(".") + 1).toLowerCase() : "";
  const contentType = MIME[ext];
  if (!contentType) return NextResponse.json({ error: "Tipo não suportado." }, { status: 400 });

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(`${PASTA}/${nome}`);
  } catch {
    return NextResponse.json({ error: "Imagem não encontrada." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
