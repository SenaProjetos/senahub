import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { verificarCadeia } from "@/modules/juridico/assinatura/cadeia";
import { montarCertificadoHtml } from "@/modules/juridico/assinatura/certificado";
import { gerarPdfDoHtml } from "@/modules/juridico/contrato/gerar";

/**
 * Certificado de conclusão da assinatura, em PDF (Fase E).
 *
 * Gerado AO VIVO a partir da trilha, nunca arquivado: o certificado é um retrato do estado atual
 * da evidência, e um arquivo congelado deixaria de refletir uma cadeia que quebrou depois. Se a
 * cadeia estiver inconsistente, o certificado diz isso — ver `montarCertificadoHtml`.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await can(session.user, "juridico", "ver"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const versao = await prisma.docJuridicoVersao.findUnique({
    where: { id },
    include: {
      documento: { select: { titulo: true, vinculoId: true } },
      aceites: { orderBy: { assinadoEm: "asc" } },
      aceitesExternos: { orderBy: { assinadoEm: "asc" } },
      eventosAssinatura: { orderBy: { sequencia: "asc" } },
    },
  });
  if (!versao) return NextResponse.json({ error: "Versão não encontrada." }, { status: 404 });
  // Mesmo gate de RH do download: certificado de contrato de equipe expõe quem assinou o quê.
  if (versao.documento.vinculoId && !HR_ADMIN_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Só RH pode ver certificado de contrato de equipe." }, { status: 403 });
  }

  const html = montarCertificadoHtml({
    documentoTitulo: versao.documento.titulo,
    versaoNumero: versao.numero,
    arquivoNome: versao.arquivoNome,
    emitidoEm: new Date(),
    verificacao: verificarCadeia(versao.eventosAssinatura),
    signatarios: [
      ...versao.aceites.map((a) => ({
        nome: a.userNome,
        origem: "interno" as const,
        assinadoEm: a.assinadoEm,
        ip: a.ip,
        userAgent: a.userAgent,
        hashArquivo: a.hashArquivo,
      })),
      ...versao.aceitesExternos.map((a) => ({
        nome: a.nome,
        origem: "externo" as const,
        documento: a.cpf,
        assinadoEm: a.assinadoEm,
        ip: a.ip,
        userAgent: a.userAgent,
        hashArquivo: a.hashArquivo,
      })),
    ],
    eventos: versao.eventosAssinatura.map((e) => ({
      sequencia: e.sequencia,
      tipo: e.tipo,
      ocorridoEm: e.ocorridoEm,
      atorNome: e.atorNome,
      ip: e.ip,
      hash: e.hash,
    })),
  });

  let pdf: Buffer;
  try {
    pdf = await gerarPdfDoHtml(html);
  } catch (e) {
    // `gerarPdfDoHtml` lança `ActionError` com mensagem de negócio quando falta `CHROME_PATH`.
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao gerar." }, { status: 503 });
  }

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="certificado-v${versao.numero}.pdf"`,
    },
  });
}
