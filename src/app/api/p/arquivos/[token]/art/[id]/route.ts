import { NextResponse } from "next/server";
import { contentDisposition } from "@/modules/projetos/arquivos/link-publico-regras";
import { artLiberadaNoLink } from "@/modules/projetos/arquivos/link-publico";
import { arquivoParaStream } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";

/**
 * Download público (sem login) do PDF de uma ART do projeto, via link somente-leitura.
 * `id` pode ser o da ART vigente ou o de uma versão histórica — `artLiberadaNoLink`
 * resolve os dois e aplica a mesma muralha de disciplinas dos arquivos.
 */
export async function GET(req: Request, ctx: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await ctx.params;

  const art = await artLiberadaNoLink(token, id);
  if (!art) return NextResponse.json({ error: "Arquivo indisponível." }, { status: 404 });

  // Stream: o arquivo pode ter centenas de MB — ler num Buffer (e copiar num Uint8Array) pesaria na memória.
  let arquivo: Awaited<ReturnType<typeof arquivoParaStream>>;
  try {
    arquivo = await arquivoParaStream(art.caminho);
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível no disco." }, { status: 410 });
  }

  await logAudit({
    modulo: "projetos",
    acao: "download-art-link-publico",
    resultado: "sucesso",
    entidade: "Art",
    entidadeId: id,
    detalhe: { linkId: art.linkId },
    ip: await getClientIp(),
  });

  const inline = new URL(req.url).searchParams.get("disposition") === "inline";
  // Cabeçalhos antes de abrir o arquivo: se algo lançasse depois do `abrir()`, o stream ficaria aberto
  // (no Windows, o arquivo travado).
  const headers = {
    "Content-Length": String(arquivo.tamanho),
    "Content-Type": "application/pdf",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": contentDisposition(inline ? "inline" : "attachment", art.nome),
  };
  return new NextResponse(arquivo.abrir(), { headers });
}
