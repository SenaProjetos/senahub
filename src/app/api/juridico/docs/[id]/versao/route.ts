import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { salvarArquivo, slug, nomeArquivoLimpo } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";

/** Upload de nova versão de documento jurídico (multipart). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  if (!(await can(user.role, "juridico", "gerir"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const doc = await prisma.documentoJuridico.findUnique({
    where: { id },
    include: { versoes: { orderBy: { numero: "desc" }, take: 1 } },
  });
  if (!doc) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo obrigatório." }, { status: 400 });
  }

  const numero = (doc.versoes[0]?.numero ?? 0) + 1;
  const nome = nomeArquivoLimpo(file.name);
  const relativo = `juridico/${slug(doc.titulo)}_${doc.id.slice(0, 6)}/v${numero}_${slug(nome)}`;
  const salvo = await salvarArquivo(relativo, Buffer.from(await file.arrayBuffer()));

  const versao = await prisma.docJuridicoVersao.create({
    data: {
      documentoId: doc.id,
      numero,
      arquivoPath: salvo.caminho,
      arquivoNome: nome,
      autorId: user.id,
    },
  });

  await logAudit({
    userId: user.id,
    modulo: "juridico",
    acao: "upload-versao",
    resultado: "sucesso",
    entidade: "DocJuridicoVersao",
    entidadeId: versao.id,
    detalhe: { documento: doc.titulo, numero },
    ip: await getClientIp(),
  });

  return NextResponse.json({ id: versao.id, numero });
}
