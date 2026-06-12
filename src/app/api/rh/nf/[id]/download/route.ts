import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { lerArquivo } from "@/lib/storage";
import { HR_ADMIN_ROLES } from "@/lib/roles";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  const { id } = await ctx.params;

  const nf = await prisma.notaFiscalPJ.findUnique({ where: { id } });
  if (!nf) return NextResponse.json({ error: "NF não encontrada." }, { status: 404 });

  const ehGestor = user.role === "admin" || HR_ADMIN_ROLES.includes(user.role);
  if (!ehGestor && nf.userId !== user.id) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(nf.arquivoPath);
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível." }, { status: 410 });
  }

  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(nf.arquivoNome)}"`,
    },
  });
}
