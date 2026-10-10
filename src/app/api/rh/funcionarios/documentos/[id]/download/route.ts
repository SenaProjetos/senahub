import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

import { lerArquivo } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;
  const doc = await prisma.funcionarioDocumento.findUnique({ where: { id } });

  // O RH abre qualquer documento; a própria pessoa abre os SEUS (Minha conta — direito de acesso
  // aos próprios dados, LGPD art. 18). Enviar e excluir continuam só com o RH (actions).
  // Para quem não é RH, documento de outra pessoa e documento inexistente dão a MESMA resposta:
  // um id alheio não confirma que o documento existe.
  const ehRh = session.user.gereRh;
  if (!ehRh && doc?.userId !== session.user.id) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  if (!doc) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(doc.caminho);
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível no disco." }, { status: 410 });
  }

  // Visualizador online (pdf.js) precisa do PDF servido inline — mesmo padrão de
  // /api/uploads/[id]/download. Auditado como ação distinta de download: abrir o preview
  // não deveria poluir o log de "baixou o documento" (decisão explícita do usuário).
  const inline = new URL(req.url).searchParams.get("disposition") === "inline";

  await logAudit({
    userId: session.user.id,
    modulo: "rh",
    acao: inline ? "visualizar-doc-funcionario" : "download-doc-funcionario",
    resultado: "sucesso",
    entidade: "FuncionarioDocumento",
    entidadeId: doc.id,
    ip: await getClientIp(),
  });

  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": doc.mime || "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(doc.nomeArquivo)}"`,
    },
  });
}
