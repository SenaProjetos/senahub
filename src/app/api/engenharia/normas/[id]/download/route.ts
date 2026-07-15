import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { podeVerBiblioteca } from "@/modules/engenharia/acesso";
import { lerArquivo } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await podeVerBiblioteca(session.user.role))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  const { id } = await ctx.params;

  const n = await prisma.normaTecnica.findUnique({ where: { id } });
  if (!n) return NextResponse.json({ error: "Norma não encontrada." }, { status: 404 });

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(n.arquivoPath);
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível no disco." }, { status: 410 });
  }

  const inline = new URL(req.url).searchParams.get("disposition") === "inline";
  await logAudit({
    userId: session.user.id,
    modulo: "engenharia",
    acao: "download-norma",
    resultado: "sucesso",
    entidade: "NormaTecnica",
    entidadeId: n.id,
    ip: await getClientIp(),
  });

  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": n.mime || "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(n.arquivoNome)}"`,
    },
  });
}
