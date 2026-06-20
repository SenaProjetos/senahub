import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { lerArquivo } from "@/lib/storage";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await can(session.user.role, "juridico", "ver"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const v = await prisma.docJuridicoVersao.findUnique({ where: { id } });
  if (!v) return NextResponse.json({ error: "Versão não encontrada." }, { status: 404 });

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(v.arquivoPath);
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível." }, { status: 410 });
  }

  const params = new URL(req.url).searchParams;
  const ehPdf = v.arquivoNome.toLowerCase().endsWith(".pdf");
  const inline = params.get("inline") === "1" || params.get("disposition") === "inline";
  const disposition = inline ? "inline" : "attachment";
  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": ehPdf ? "application/pdf" : "application/octet-stream",
      "Content-Disposition": `${disposition}; filename="${encodeURIComponent(v.arquivoNome)}"`,
    },
  });
}
