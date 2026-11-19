import { NextResponse } from "next/server";
import { contentDisposition } from "@/modules/projetos/arquivos/link-publico-regras";
import { artLiberadaNoAlcance } from "@/modules/projetos/arquivos/link-publico";
import { acessoAoProjetoDoPortal } from "@/modules/portal/acesso";
import { arquivoParaStream } from "@/lib/storage";
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

  // Stream: o arquivo pode ter centenas de MB — ler num Buffer (e copiar num Uint8Array) pesaria na memória.
  let arquivo: Awaited<ReturnType<typeof arquivoParaStream>>;
  try {
    arquivo = await arquivoParaStream(art.caminho);
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
