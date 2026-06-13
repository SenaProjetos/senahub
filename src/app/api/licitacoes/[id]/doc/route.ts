import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { salvarArquivo, slug, nomeArquivoLimpo } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";

/** Upload de documento da licitação (cria doc + versão, ou nova versão se título igual). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  if (!(await can(user.role, "licitacoes", "gerir"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const lic = await prisma.licitacao.findUnique({ where: { id } });
  if (!lic) return NextResponse.json({ error: "Licitação não encontrada." }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  const titulo = String(form.get("titulo") ?? "").trim();
  if (!(file instanceof File) || !titulo) {
    return NextResponse.json({ error: "Título e arquivo obrigatórios." }, { status: 400 });
  }

  let doc = await prisma.documentoLicitacao.findFirst({
    where: { licitacaoId: id, titulo },
    include: { versoes: { orderBy: { numero: "desc" }, take: 1 } },
  });
  if (!doc) {
    doc = {
      ...(await prisma.documentoLicitacao.create({ data: { licitacaoId: id, titulo } })),
      versoes: [],
    };
  }

  const numero = (doc.versoes[0]?.numero ?? 0) + 1;
  const nome = nomeArquivoLimpo(file.name);
  const relativo = `licitacoes/${slug(lic.titulo)}_${lic.id.slice(0, 6)}/${slug(titulo)}_v${numero}_${slug(nome)}`;
  const salvo = await salvarArquivo(relativo, Buffer.from(await file.arrayBuffer()));

  await prisma.docLicitacaoVersao.create({
    data: { documentoId: doc.id, numero, arquivoPath: salvo.caminho, arquivoNome: nome, autorId: user.id },
  });

  await logAudit({
    userId: user.id,
    modulo: "licitacoes",
    acao: "upload-doc",
    resultado: "sucesso",
    entidade: "DocumentoLicitacao",
    entidadeId: doc.id,
    detalhe: { titulo, numero },
    ip: await getClientIp(),
  });

  return NextResponse.json({ id: doc.id, numero });
}
