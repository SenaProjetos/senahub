import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { lerArquivo } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await can(session.user.role, "financeiro", "ver"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  const { id } = await ctx.params;

  const doc = await prisma.documentoFinanceiro.findUnique({ where: { id } });
  if (!doc?.arquivoPath) return NextResponse.json({ error: "Documento sem arquivo." }, { status: 404 });

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(doc.arquivoPath);
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível no disco." }, { status: 410 });
  }

  await logAudit({
    userId: session.user.id,
    modulo: "financeiro",
    acao: "download-doc-financeiro",
    resultado: "sucesso",
    entidade: "DocumentoFinanceiro",
    entidadeId: doc.id,
    ip: await getClientIp(),
  });

  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": doc.arquivoMime || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(doc.arquivoNome || "documento")}"`,
    },
  });
}
