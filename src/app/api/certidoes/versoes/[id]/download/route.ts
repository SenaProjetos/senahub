import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { lerArquivo } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";

/** Download de uma versão histórica específica de certidão. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (session.user.mustChangePassword || !session.user.ativo) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }
  if (!(await can(session.user, "certidoes", "ver"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const v = await prisma.certidaoVersao.findUnique({ where: { id } });
  if (!v) return NextResponse.json({ error: "Versão não encontrada." }, { status: 404 });
  if (!v.arquivoPath || !v.arquivoNome) {
    return NextResponse.json({ error: "Nenhum arquivo anexado nesta versão." }, { status: 404 });
  }

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(v.arquivoPath);
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível no disco." }, { status: 410 });
  }

  const inline = new URL(req.url).searchParams.get("inline") === "1";
  await logAudit({
    userId: session.user.id,
    modulo: "certidoes",
    acao: "download-certidao",
    resultado: "sucesso",
    entidade: "CertidaoVersao",
    entidadeId: v.id,
    ip: await getClientIp(),
  });

  const ehPdf = v.mimeType === "application/pdf" || v.arquivoNome.toLowerCase().endsWith(".pdf");
  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": v.mimeType || (ehPdf ? "application/pdf" : "application/octet-stream"),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(v.arquivoNome)}"`,
    },
  });
}
