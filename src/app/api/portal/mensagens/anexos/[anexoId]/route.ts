import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { arquivoParaStream } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";
import { contentDisposition } from "@/modules/projetos/arquivos/link-publico-regras";
import { tipoParaAbrirNoNavegador } from "@/modules/portal/mensagens/regras";
import { anexoParaUsuario } from "@/modules/portal/mensagens/service";

const SEM_CACHE = "private, no-store";

/**
 * Download de um anexo da conversa do portal com a coordenação: a conta do cliente pela porta do portal, a equipe pela
 * audiência da conversa (`anexoParaUsuario`). Qualquer recusa — sem sessão, sem acesso, anexo inexistente ou arquivo
 * fora do disco — é o mesmo 404, que não diz se o anexo existe. `?disposition=inline` abre no navegador só PDF e
 * imagem, com o tipo pela extensão (nunca o que o navegador de quem enviou declarou); o resto sempre como anexo.
 * Sem cache: quem perde o acesso não reabre do cache.
 */
const indisponivel = () =>
  NextResponse.json({ error: "Arquivo indisponível." }, { status: 404, headers: { "Cache-Control": SEM_CACHE } });

export async function GET(req: Request, ctx: { params: Promise<{ anexoId: string }> }) {
  const { anexoId } = await ctx.params;
  const session = await getSession();
  const user = session?.user ?? null;
  if (!user) return indisponivel();
  const anexo = await anexoParaUsuario(anexoId, { id: user.id, tipo: user.tipo, mustChangePassword: user.mustChangePassword });
  if (!anexo) return indisponivel();

  let arquivo: Awaited<ReturnType<typeof arquivoParaStream>>;
  try {
    arquivo = await arquivoParaStream(anexo.caminho);
  } catch {
    return indisponivel();
  }

  const tipoInline = tipoParaAbrirNoNavegador(anexo.nome, new URL(req.url).searchParams.get("disposition") === "inline");
  const disposition = tipoInline ? "inline" : "attachment";
  await logAudit({
    modulo: "portal",
    acao: "conversa-anexo-baixado",
    resultado: "sucesso",
    userId: user.id,
    entidade: "AnexoMensagemPortal",
    entidadeId: anexoId,
    detalhe: { disposition },
    ip: await getClientIp(),
  });
  // Cabeçalhos antes de abrir o arquivo: se algo lançasse depois do `abrir()`, o stream ficaria aberto.
  const headers = new Headers({
    "Content-Length": String(arquivo.tamanho),
    "Content-Type": tipoInline ?? "application/octet-stream",
    "Content-Disposition": contentDisposition(disposition, anexo.nome),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": SEM_CACHE,
  });
  return new NextResponse(arquivo.abrir(), { headers });
}
