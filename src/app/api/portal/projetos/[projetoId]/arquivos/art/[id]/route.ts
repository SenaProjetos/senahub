import { NextResponse } from "next/server";
import { artLiberadaNoAlcance } from "@/modules/projetos/arquivos/link-publico";
import { acessoAoProjetoDoPortal } from "@/modules/portal/acesso";
import { lerArquivo } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";

/**
 * Download do PDF de uma ART do projeto pelo portal do cliente. Espelha `/api/p/arquivos/[token]/art/[id]`:
 * `acessoAoProjetoDoPortal` decide se a pessoa entra e `artLiberadaNoAlcance` resolve a ART vigente ou uma
 * versão histórica dentro do projeto.
 */
export async function GET(req: Request, ctx: { params: Promise<{ projetoId: string; id: string }> }) {
  const { projetoId, id } = await ctx.params;
  const acesso = await acessoAoProjetoDoPortal(projetoId);
  if (!acesso.ok) return NextResponse.json({ error: acesso.erro }, { status: acesso.status });

  const art = await artLiberadaNoAlcance(acesso.alcance, id);
  if (!art) return NextResponse.json({ error: "Arquivo indisponível." }, { status: 404 });

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(art.caminho);
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível no disco." }, { status: 410 });
  }

  await logAudit({
    modulo: "projetos",
    acao: "download-art-portal",
    resultado: "sucesso",
    userId: acesso.userId,
    entidade: "Art",
    entidadeId: id,
    detalhe: { projetoId },
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
