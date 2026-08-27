import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { lerArquivo } from "@/lib/storage";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { getClientIp } from "@/lib/audit";
import { comRetentativaDeConflito, registrarEventoAssinatura } from "@/modules/juridico/assinatura/service";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await can(session.user, "juridico", "ver"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const v = await prisma.docJuridicoVersao.findUnique({
    where: { id },
    include: { documento: { select: { vinculoId: true } } },
  });
  if (!v) return NextResponse.json({ error: "Versão não encontrada." }, { status: 404 });
  if (v.documento.vinculoId && !HR_ADMIN_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Só RH pode baixar contrato de equipe." }, { status: 403 });
  }

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(v.arquivoPath);
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível." }, { status: 410 });
  }

  // Fase E — registra que a pessoa VIU o documento, um evento por (ator, versão).
  //
  // Sem a dedup, cada download recarregaria a cadeia com ruído e afogaria os eventos que
  // importam. Best-effort: falhar ao registrar a visualização não pode impedir alguém de ler o
  // próprio contrato — mesmo princípio do `logAudit`, que também engole a própria falha.
  try {
    const jaViu = await prisma.eventoAssinatura.findFirst({
      where: { versaoId: v.id, ator: session.user.id, tipo: "visualizado" },
      select: { id: true },
    });
    if (!jaViu) {
      const userAgent = req.headers.get("user-agent");
      const ip = await getClientIp();
      await comRetentativaDeConflito(() =>
        prisma.$transaction((tx) =>
          registrarEventoAssinatura(tx, {
            versaoId: v.id,
            tipo: "visualizado",
            ator: session.user.id,
            atorNome: session.user.name,
            ip,
            userAgent,
          }),
        ),
      );
    }
  } catch (err) {
    console.error(`[juridico] falha ao registrar visualização da versão ${v.id}:`, err);
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
