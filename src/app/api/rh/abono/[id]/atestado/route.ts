import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { lerArquivo } from "@/lib/storage";


const TIPOS: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

/** `?ver=1` abre no navegador (só PDF/imagem); sem ele — ou para outros formatos — baixa. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  const { id } = await ctx.params;

  const abono = await prisma.abonoFalta.findUnique({ where: { id } });
  if (!abono || !abono.atestadoPath) {
    return NextResponse.json({ error: "Atestado não encontrado." }, { status: 404 });
  }
  // Dono ou gestor de RH.
  const ehGestor = user.gereRh;
  if (abono.userId !== user.id && !ehGestor) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(abono.atestadoPath);
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível." }, { status: 410 });
  }
  const nome = abono.atestadoNome ?? "atestado";
  const ext = nome.split(".").pop()?.toLowerCase() ?? "";
  const tipo = TIPOS[ext];
  const inline = !!tipo && new URL(req.url).searchParams.get("ver") === "1";
  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": tipo ?? "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(nome)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
