import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { salvarArquivo, slug, nomeArquivoLimpo } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";

const MAX = 25 * 1024 * 1024;

/**
 * Upload de nova versão de certidão (multipart) — anexo inicial OU renovação.
 * Cada envio cria a sua própria `CertidaoVersao` com o arquivo enviado; `Certidao`
 * guarda validade/arquivo "atuais" como cache (ver módulo certidoes/service.ts).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  if (user.mustChangePassword || !user.ativo) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }
  if (!(await can(user, "certidoes", "gerir"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const certidao = await prisma.certidao.findUnique({
    where: { id },
    include: { tipo: true, versoes: { orderBy: { numero: "desc" }, take: 1 } },
  });
  if (!certidao) return NextResponse.json({ error: "Certidão não encontrada." }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  const validade = form.get("validade");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo obrigatório." }, { status: 400 });
  }
  if (file.size > MAX) return NextResponse.json({ error: "Arquivo muito grande (máx 25 MB)." }, { status: 400 });
  if (typeof validade !== "string" || !validade.trim()) {
    return NextResponse.json({ error: "Informe a validade." }, { status: 400 });
  }

  const numero = (certidao.versoes[0]?.numero ?? 0) + 1;
  const nome = nomeArquivoLimpo(file.name);
  const relativo = `certidoes/${slug(certidao.tipo.nome)}_${certidao.id.slice(0, 6)}/v${numero}_${slug(nome)}`;
  const salvo = await salvarArquivo(relativo, Buffer.from(await file.arrayBuffer()));
  const validadeData = new Date(validade);
  const mimeType = file.type || null;

  const [versao] = await prisma.$transaction([
    prisma.certidaoVersao.create({
      data: {
        certidaoId: certidao.id,
        numero,
        validade: validadeData,
        arquivoPath: salvo.caminho,
        arquivoNome: nome,
        mimeType,
        autorId: user.id,
      },
    }),
    prisma.certidao.update({
      where: { id: certidao.id },
      data: { validade: validadeData, arquivoPath: salvo.caminho, arquivoNome: nome },
    }),
  ]);

  await logAudit({
    userId: user.id,
    modulo: "certidoes",
    acao: "nova-versao-certidao",
    resultado: "sucesso",
    entidade: "CertidaoVersao",
    entidadeId: versao.id,
    detalhe: { tipo: certidao.tipo.nome, numero },
    ip: await getClientIp(),
  });

  return NextResponse.json({ id: versao.id, numero });
}
