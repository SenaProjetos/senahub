import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { lerArquivo } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  // Fase 1: gate reusa `comercial:ver` (documentos ancorados na proposta).
  if (!(await can(session.user.role, "comercial", "ver"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  const { id: versaoId } = await ctx.params;

  const versao = await prisma.documentoVersao.findUnique({
    where: { id: versaoId },
    select: { caminho: true, nomeArquivo: true, mime: true, documentoId: true },
  });
  if (!versao) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(versao.caminho);
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível no disco." }, { status: 410 });
  }

  await logAudit({
    userId: session.user.id,
    modulo: "documentos_cliente",
    acao: "download-documento",
    resultado: "sucesso",
    entidade: "DocumentoVersao",
    entidadeId: versaoId,
    ip: await getClientIp(),
  });

  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": versao.mime || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(versao.nomeArquivo)}"`,
    },
  });
}
