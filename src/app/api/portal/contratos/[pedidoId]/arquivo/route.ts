import { NextResponse } from "next/server";
import { getClientIp, logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { lerArquivo } from "@/lib/storage";
import { comRetentativaDeConflito, registrarEventoAssinatura } from "@/modules/juridico/assinatura/service";
import { arquivoDoPedidoParaConta, MSG_ARQUIVO_INDISPONIVEL } from "@/modules/portal/contratos/arquivo";

/**
 * PDF do contrato que a equipe pediu para assinar, para a conta do portal do cliente (spec
 * `docs/superpowers/specs/2026-11-21-portal-assinatura-contrato-design.md`). A decisão (conta do cliente do documento,
 * situação visível) é `arquivoDoPedidoParaConta`; aqui ficam a leitura do arquivo, o evento "visualizado" e a auditoria.
 */
export async function GET(req: Request, ctx: { params: Promise<{ pedidoId: string }> }) {
  const { pedidoId } = await ctx.params;
  const session = await getSession();
  const acesso = await arquivoDoPedidoParaConta(session?.user ?? null, pedidoId);
  if (!acesso.ok) return NextResponse.json({ error: acesso.erro }, { status: acesso.status });
  const { versao, conta } = acesso;

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(versao.arquivoPath);
  } catch {
    return NextResponse.json({ error: MSG_ARQUIVO_INDISPONIVEL }, { status: 410 });
  }

  const ip = await getClientIp();

  // Um evento "visualizado" por (ator, versão), como na rota do Jurídico. Best-effort: falhar ao registrar a
  // visualização não pode impedir o cliente de ler o próprio contrato.
  try {
    const jaViu = await prisma.eventoAssinatura.findFirst({
      where: { versaoId: versao.id, ator: conta.userId, tipo: "visualizado" },
      select: { id: true },
    });
    if (!jaViu) {
      const userAgent = req.headers.get("user-agent");
      await comRetentativaDeConflito(() =>
        prisma.$transaction((tx) =>
          registrarEventoAssinatura(tx, {
            versaoId: versao.id,
            tipo: "visualizado",
            ator: conta.userId,
            atorNome: conta.nome,
            ip,
            userAgent,
          }),
        ),
      );
    }
  } catch (err) {
    console.error(`[portal] falha ao registrar visualização da versão ${versao.id}:`, err);
  }

  const disposition = new URL(req.url).searchParams.get("disposition") === "inline" ? "inline" : "attachment";
  await logAudit({
    userId: conta.userId,
    modulo: "portal",
    acao: "baixar-contrato",
    entidade: "PedidoAssinaturaPortal",
    entidadeId: pedidoId,
    detalhe: { versaoId: versao.id, disposition },
    ip,
  });

  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${encodeURIComponent(versao.arquivoNome)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
