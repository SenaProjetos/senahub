import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { lerArquivo } from "@/lib/storage";
import { linkVigente } from "@/lib/link-publico";
import { getClientIp } from "@/lib/audit";
import { comRetentativaDeConflito, registrarEventoAssinatura } from "@/modules/juridico/assinatura/service";

/**
 * Serve o documento para o signatário externo (Fase F).
 *
 * Rota PÚBLICA: a autorização é a posse do token, e nada mais — por isso valida a vigência do
 * link em vez de sessão. `/api` está fora do middleware (ver `middleware.ts`), então a checagem
 * aqui é a única que existe.
 */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const link = await prisma.linkPublicoAssinatura.findUnique({
    where: { token },
    include: { versao: { select: { id: true, arquivoPath: true, arquivoNome: true } } },
  });
  // 404 e não 403: link revogado ou expirado não deve nem confirmar que existiu.
  if (!link || !linkVigente(link)) {
    return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });
  }

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(link.versao.arquivoPath);
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível." }, { status: 410 });
  }

  // Evento `visualizado` — a prova de que o documento foi aberto ANTES de assinado. Um evento por
  // link (não por acesso), pelo mesmo motivo do fluxo interno: reabrir não é fato novo.
  // Best-effort: falha de registro não pode impedir a pessoa de ler o que vai assinar.
  try {
    const jaViu = await prisma.eventoAssinatura.findFirst({
      where: { versaoId: link.versaoId, ator: `link:${link.id}`, tipo: "visualizado" },
      select: { id: true },
    });
    if (!jaViu) {
      const ip = await getClientIp();
      const userAgent = req.headers.get("user-agent");
      await comRetentativaDeConflito(() =>
        prisma.$transaction((tx) =>
          registrarEventoAssinatura(tx, {
            versaoId: link.versaoId,
            tipo: "visualizado",
            // `link:<id>` distingue o ator externo do `userId` interno sem inventar um usuário.
            ator: `link:${link.id}`,
            atorNome: link.nome,
            ip,
            userAgent,
          }),
        ),
      );
    }
  } catch (err) {
    console.error(`[juridico] falha ao registrar visualização externa do link ${link.id}:`, err);
  }

  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": link.versao.arquivoNome.toLowerCase().endsWith(".pdf")
        ? "application/pdf"
        : "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(link.versao.arquivoNome)}"`,
      // Documento sob token nunca deve ficar em cache compartilhado.
      "Cache-Control": "private, no-store",
    },
  });
}
