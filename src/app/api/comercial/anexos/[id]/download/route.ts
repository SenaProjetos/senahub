import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { resolverCaminho } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";
import { caminhoAnexoLeadValido } from "@/modules/comercial/vinculo/regras";

/** Baixa um anexo de lead. Gate: `comercial:gerir`. Por stream: o anexo chega a 500 MB. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { can } = await import("@/lib/permissions");
  if (!(await can(session.user, "comercial", "gerir"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  const { id } = await ctx.params;

  const anexo = await prisma.anexoLead.findUnique({ where: { id } });
  if (!anexo) return NextResponse.json({ error: "Anexo não encontrado." }, { status: 404 });
  // Linha antiga com caminho fora de `comercial/leads/` (gravada sem validação) pode apontar para arquivo de outro
  // cliente: não é servida.
  if (!caminhoAnexoLeadValido(anexo.caminho)) {
    return NextResponse.json({ error: "Arquivo indisponível no disco." }, { status: 410 });
  }

  let caminhoAbs: string;
  let tamanho: number;
  try {
    caminhoAbs = resolverCaminho(anexo.caminho);
    tamanho = (await stat(caminhoAbs)).size;
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

  const stream = Readable.toWeb(createReadStream(caminhoAbs)) as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": anexo.mime || "application/octet-stream",
      "Content-Length": String(tamanho),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(anexo.nomeArquivo)}"`,
    },
  });
}
