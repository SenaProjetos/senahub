import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { lerArquivo } from "@/lib/storage";
import { linkVigente } from "@/lib/link-publico";
import { getClientIp } from "@/lib/audit";
import { logAudit } from "@/lib/audit";
import { comRetentativaDeConflito, registrarEventoAssinatura } from "@/modules/juridico/assinatura/service";
import { devePassarParaAssinado } from "@/modules/juridico/contrato/estado";

/**
 * Assinatura externa por link (Fase F).
 *
 * Rota PÚBLICA — a autorização é a posse do token. `/api` está fora do middleware, então tudo o
 * que protege isto está neste arquivo: vigência do link, uso único e validação do corpo.
 */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  let corpo: { nome?: unknown; cpf?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
  const nome = typeof corpo.nome === "string" ? corpo.nome.trim() : "";
  const cpf = typeof corpo.cpf === "string" ? corpo.cpf.trim() : "";
  if (nome.length < 3) {
    return NextResponse.json({ error: "Informe seu nome completo." }, { status: 400 });
  }

  const link = await prisma.linkPublicoAssinatura.findUnique({
    where: { token },
    include: {
      aceite: { select: { id: true } },
      versao: {
        select: {
          id: true,
          arquivoPath: true,
          documento: { select: { id: true, tipo: true, statusContrato: true } },
        },
      },
    },
  });
  if (!link || !linkVigente(link)) {
    return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });
  }
  // Uso único. A unique em `AceiteExternoDocumento.linkId` garante isto no banco também; esta
  // checagem só devolve mensagem decente em vez de erro de constraint.
  if (link.aceite) {
    return NextResponse.json({ error: "Este documento já foi assinado." }, { status: 409 });
  }

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(link.versao.arquivoPath);
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível para assinatura." }, { status: 410 });
  }
  // Hash do arquivo NO MOMENTO da assinatura — é o que amarra a assinatura a este conteúdo exato.
  const hashArquivo = createHash("sha256").update(conteudo).digest("hex");
  const ip = await getClientIp();
  const userAgent = req.headers.get("user-agent");

  try {
    await comRetentativaDeConflito(() =>
      prisma.$transaction(async (tx) => {
        await tx.aceiteExternoDocumento.create({
          data: {
            linkId: link.id,
            versaoId: link.versaoId,
            nome,
            cpf: cpf || null,
            hashArquivo,
            ip,
            userAgent,
          },
        });

        // Mesma cadeia do fluxo interno, ancorada no link em vez de num `userId`.
        await registrarEventoAssinatura(tx, {
          versaoId: link.versaoId,
          tipo: "assinado",
          ator: `link:${link.id}`,
          atorNome: nome,
          ip,
          userAgent,
          hashArquivo,
        });

        // O link morre no uso: revogar depois de assinado impede reabrir e reenviar o formulário.
        await tx.linkPublicoAssinatura.update({ where: { id: link.id }, data: { ativo: false } });

        // Assinatura externa também fecha o status do contrato — quem assinou por fora assinou
        // igual. Predicado único de `contrato/estado.ts`.
        const doc = link.versao.documento;
        if (devePassarParaAssinado(doc.tipo, doc.statusContrato)) {
          await tx.documentoJuridico.update({
            where: { id: doc.id },
            data: { statusContrato: "assinado", assinadoEm: new Date() },
          });
        }
      }),
    );
  } catch (err) {
    console.error(`[juridico] falha na assinatura externa do link ${link.id}:`, err);
    return NextResponse.json({ error: "Não foi possível registrar a assinatura." }, { status: 500 });
  }

  // Auditoria sem `userId`: quem assinou não é usuário do sistema. O nome declarado e o IP ficam
  // no detalhe, que é a identificação possível neste fluxo.
  await logAudit({
    modulo: "juridico",
    acao: "assinatura-externa",
    resultado: "sucesso",
    entidade: "AceiteExternoDocumento",
    entidadeId: link.id,
    detalhe: { nome, versaoId: link.versaoId, hashArquivo },
    ip,
  });

  return NextResponse.json({ ok: true });
}
