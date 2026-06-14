import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { lerArquivo } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!HR_ADMIN_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  const { id } = await ctx.params;

  const doc = await prisma.funcionarioDocumento.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(doc.caminho);
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível no disco." }, { status: 410 });
  }

  await logAudit({
    userId: session.user.id,
    modulo: "rh",
    acao: "download-doc-funcionario",
    resultado: "sucesso",
    entidade: "FuncionarioDocumento",
    entidadeId: doc.id,
    ip: await getClientIp(),
  });

  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": doc.mime || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(doc.nomeArquivo)}"`,
    },
  });
}
