import { NextResponse } from "next/server";
import { abreNoNavegador, contentDisposition, contentTypeDoDownload } from "@/modules/projetos/arquivos/link-publico-regras";
import { uploadLiberadoNoLink } from "@/modules/projetos/arquivos/link-publico";
import { motivoBloqueioDosUploads } from "@/modules/uploads/ciclo/service";
import { arquivoParaStream } from "@/lib/storage";
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
  // Ciclo documental: revisão com bloqueio de download não sai pelo link (I7).
  if (await motivoBloqueioDosUploads(prisma, [upload.id], "download")) {
    return NextResponse.json({ error: "Arquivo indisponível." }, { status: 404 });
  }

  // Stream: o arquivo pode ter centenas de MB — ler num Buffer (e copiar num Uint8Array) pesaria na memória.
  let arquivo: Awaited<ReturnType<typeof arquivoParaStream>>;
  try {
    arquivo = await arquivoParaStream(upload.caminho);
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível no disco." }, { status: 410 });
  }

  await logAudit({
    modulo: "uploads",
    acao: "download-link-publico",
    resultado: "sucesso",
    entidade: "Upload",
    entidadeId: upload.id,
    detalhe: { linkId: upload.linkId },
    ip: await getClientIp(),
  });

  // Só PDF abre no navegador: outro tipo inline (HTML, SVG) rodaria na origem do sistema.
  const inline = abreNoNavegador(upload.nomeArquivo, new URL(req.url).searchParams.get("disposition") === "inline");
  // Guarda o id do link, nunca o token: o histórico é lido por colaboradores e o token é a chave
  // de acesso do cliente.
  await registrarAcessoUploads({
    uploadIds: [upload.id],
    tipo: inline ? "visualizacao" : "download",
    origem: "link_publico",
    userId: null,
    linkId: upload.linkId,
  });
  const disposition = inline ? "inline" : "attachment";
  // Cabeçalhos (já validados pelo `Headers`) antes de abrir o arquivo: se algo lançasse depois do `abrir()`,
  // o stream ficaria aberto (no Windows, o arquivo travado).
  const headers = new Headers({
    "Content-Length": String(arquivo.tamanho),
    "Content-Type": contentTypeDoDownload(upload.mimeType, inline),
    "Content-Disposition": contentDisposition(disposition, upload.nomeArquivo),
    "X-Content-Type-Options": "nosniff",
  });
  return new NextResponse(arquivo.abrir(), { headers });
}
