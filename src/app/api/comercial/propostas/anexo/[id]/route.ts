import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { lerArquivo } from "@/lib/storage";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await can(session.user.role, "comercial", "ver"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  const { id } = await ctx.params;
  const anexo = await prisma.propostaAnexo.findUnique({ where: { id } });
  if (!anexo) return NextResponse.json({ error: "Anexo não encontrado." }, { status: 404 });

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(anexo.caminho);
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível." }, { status: 410 });
  }
  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": anexo.mime || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(anexo.nome)}"`,
    },
  });
}
