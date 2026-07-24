import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { lerArquivo } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";

/** Baixa um anexo de lead. Gate: `comercial:gerir`. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { can } = await import("@/lib/permissions");
  if (!(await can(session.user.role, "comercial", "gerir"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  const { id } = await ctx.params;

  const anexo = await prisma.anexoLead.findUnique({ where: { id } });
  if (!anexo) return NextResponse.json({ error: "Anexo não encontrado." }, { status: 404 });

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(anexo.caminho);
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível no disco." }, { status: 410 });
  }

  await logAudit({
    userId: session.user.id,
    modulo: "comercial",
    acao: "download-anexo-lead",
    resultado: "sucesso",
    entidade: "AnexoLead",
    entidadeId: anexo.id,
    ip: await getClientIp(),
  });

  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": anexo.mime || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(anexo.nomeArquivo)}"`,
    },
  });
}
