import { NextResponse } from "next/server";
import { artLiberadaNoLink } from "@/modules/projetos/arquivos/link-publico";
import { lerArquivo } from "@/lib/storage";
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

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(art.caminho);
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível no disco." }, { status: 410 });
  }

  await logAudit({
    modulo: "projetos",
    acao: "download-art-link-publico",
    resultado: "sucesso",
    entidade: "Art",
    entidadeId: id,
    detalhe: { token },
    ip: await getClientIp(),
  });

  const inline = new URL(req.url).searchParams.get("disposition") === "inline";
  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(art.nome)}"`,
    },
  });
}
