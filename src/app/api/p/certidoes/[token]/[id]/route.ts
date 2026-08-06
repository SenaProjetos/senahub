import { NextResponse } from "next/server";
import { certidaoLiberadaNoLink } from "@/modules/certidoes/link-publico";
import { lerArquivo } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";

/**
 * Download público (sem login) de uma certidão, via link somente-leitura.
 * Só serve certidões na whitelist de um link vigente — validação em `certidaoLiberadaNoLink`.
 * `?disposition=inline` abre PDF no navegador.
 */
export async function GET(req: Request, ctx: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await ctx.params;

  const certidao = await certidaoLiberadaNoLink(token, id);
  if (!certidao) return NextResponse.json({ error: "Certidão indisponível." }, { status: 404 });

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(certidao.caminho);
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível no disco." }, { status: 410 });
  }

  await logAudit({
    modulo: "certidoes",
    acao: "download-link-publico",
    resultado: "sucesso",
    entidade: "Certidao",
    entidadeId: id,
    detalhe: { token },
    ip: await getClientIp(),
  });

  const inline = new URL(req.url).searchParams.get("disposition") === "inline";
  const ehPdf = certidao.nome.toLowerCase().endsWith(".pdf");
  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": ehPdf ? "application/pdf" : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(certidao.nome)}"`,
    },
  });
}
