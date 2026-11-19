import { NextResponse } from "next/server";
import { abreNoNavegador, contentDisposition } from "@/modules/projetos/arquivos/link-publico-regras";
import { uploadLiberadoNoAlcance } from "@/modules/projetos/arquivos/link-publico";
import { acessoAoProjetoDoPortal } from "@/modules/portal/acesso";
import { motivoBloqueioDosUploads } from "@/modules/uploads/ciclo/service";
import { arquivoParaStream } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { registrarAcessoUploads } from "@/modules/uploads/historico/service";

/**
 * Download de um arquivo das entregas pelo portal do cliente. Espelha `/api/p/arquivos/[token]/[uploadId]`,
 * com login no lugar do token: `acessoAoProjetoDoPortal` decide se a pessoa entra e `uploadLiberadoNoAlcance`
 * (o MESMO núcleo do link) se o arquivo está nas pastas do cliente DESTE projeto. `?disposition=inline`
 * abre PDF no navegador.
 */
export async function GET(req: Request, ctx: { params: Promise<{ projetoId: string; uploadId: string }> }) {
  const { projetoId, uploadId } = await ctx.params;
  const acesso = await acessoAoProjetoDoPortal(projetoId);
  if (!acesso.ok) return NextResponse.json({ error: acesso.erro }, { status: acesso.status });

  const upload = await uploadLiberadoNoAlcance(acesso.alcance, uploadId);
  if (!upload) return NextResponse.json({ error: "Arquivo indisponível." }, { status: 404 });
  // Ciclo documental: revisão com bloqueio de download não sai pelo portal (I7).
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
    acao: "download-portal",
    resultado: "sucesso",
    userId: acesso.userId,
    entidade: "Upload",
    entidadeId: upload.id,
    detalhe: { projetoId },
    ip: await getClientIp(),
  });

  // Só PDF abre no navegador: outro tipo inline (HTML, SVG) rodaria na origem do sistema.
  const inline = abreNoNavegador(upload.nomeArquivo, new URL(req.url).searchParams.get("disposition") === "inline");
  await registrarAcessoUploads({
    uploadIds: [upload.id],
    tipo: inline ? "visualizacao" : "download",
    origem: "portal",
    userId: acesso.userId,
    linkId: null,
  });
  const disposition = inline ? "inline" : "attachment";
  // Cabeçalhos antes de abrir o arquivo: se algo lançasse depois do `abrir()`, o stream ficaria aberto
  // (no Windows, o arquivo travado).
  const headers = {
    "Content-Length": String(arquivo.tamanho),
    "Content-Type": upload.mimeType || "application/octet-stream",
    "Content-Disposition": contentDisposition(disposition, upload.nomeArquivo),
    "X-Content-Type-Options": "nosniff",
  };
  return new NextResponse(arquivo.abrir(), { headers });
}
