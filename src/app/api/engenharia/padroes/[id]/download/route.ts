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

  const p = await prisma.padraoTecnico.findUnique({ where: { id } });
  if (!p) return NextResponse.json({ error: "Padrão não encontrado." }, { status: 404 });

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(p.arquivoPath);
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível no disco." }, { status: 410 });
  }

  const inline = new URL(req.url).searchParams.get("disposition") === "inline";
  await logAudit({
    userId: session.user.id,
    modulo: "engenharia",
    acao: "download-padrao",
    resultado: "sucesso",
    entidade: "PadraoTecnico",
    entidadeId: p.id,
    ip: await getClientIp(),
  });

  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": p.mime || "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(p.arquivoNome)}"`,
    },
  });
}
