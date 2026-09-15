import { NextResponse } from "next/server";
import { uploadLiberadoNoLink } from "@/modules/projetos/arquivos/link-publico";
import { lerArquivo } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { registrarAcessoUploads } from "@/modules/uploads/historico/service";

/**
 * Download público (sem login) de um arquivo do projeto, via link somente-leitura.
 * Só serve uploads validados de disciplinas liberadas num link vigente — a validação
 * fica em `uploadLiberadoNoLink`. `?disposition=inline` abre PDF no navegador.
 */
export async function GET(req: Request, ctx: { params: Promise<{ token: string; uploadId: string }> }) {
  const { token, uploadId } = await ctx.params;

  const upload = await uploadLiberadoNoLink(token, uploadId);
  if (!upload) return NextResponse.json({ error: "Arquivo indisponível." }, { status: 404 });

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(upload.caminho);
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível no disco." }, { status: 410 });
  }

  await logAudit({
    modulo: "uploads",
    acao: "download-link-publico",
    resultado: "sucesso",
    entidade: "Upload",
    entidadeId: upload.id,
    detalhe: { token },
    ip: await getClientIp(),
  });

  const inline = new URL(req.url).searchParams.get("disposition") === "inline";
  // Guarda o id do link, nunca o token: o histórico é lido por colaboradores e o token é a chave
  // de acesso do cliente. O link já foi validado acima — aqui só se resolve quem ele é.
  const link = await prisma.linkPublicoArquivos.findUnique({ where: { token }, select: { id: true } });
  await registrarAcessoUploads({
    uploadIds: [upload.id],
    tipo: inline ? "visualizacao" : "download",
    origem: "link_publico",
    userId: null,
    linkId: link?.id ?? null,
  });
  const disposition = inline ? "inline" : "attachment";
  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": upload.mimeType || "application/octet-stream",
      "Content-Disposition": `${disposition}; filename="${encodeURIComponent(upload.nomeArquivo)}"`,
    },
  });
}
