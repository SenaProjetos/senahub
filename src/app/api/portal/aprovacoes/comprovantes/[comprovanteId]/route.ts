import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { arquivoParaStream } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";
import { contentDisposition } from "@/modules/projetos/arquivos/link-publico-regras";
import { tipoParaAbrirNoNavegador } from "@/modules/portal/mensagens/regras";
import { comprovanteParaEquipe } from "@/modules/portal/aprovacao-entrega/service";

const SEM_CACHE = "private, no-store";

/**
 * Download do comprovante de uma resposta registrada por fora. Só a equipe da audiência do projeto
 * (`comprovanteParaEquipe`); o cliente nunca baixa. Qualquer recusa — sem sessão, sem acesso, inexistente ou fora do
 * disco — é o mesmo 404. `?disposition=inline` abre no navegador só PDF e imagem (tipo pela extensão); o resto
 * (EML, MSG) sempre como anexo. Sem cache.
 */
const indisponivel = () =>
  NextResponse.json({ error: "Arquivo indisponível." }, { status: 404, headers: { "Cache-Control": SEM_CACHE } });

export async function GET(req: Request, ctx: { params: Promise<{ comprovanteId: string }> }) {
  const { comprovanteId } = await ctx.params;
  const session = await getSession();
  const user = session?.user ?? null;
  if (!user || user.tipo !== "interno") return indisponivel();
  const c = await comprovanteParaEquipe(comprovanteId, user.id);
  if (!c) return indisponivel();

  let arquivo: Awaited<ReturnType<typeof arquivoParaStream>>;
  try {
    arquivo = await arquivoParaStream(c.caminho);
  } catch {
    return indisponivel();
  }

  const tipoInline = tipoParaAbrirNoNavegador(c.nome, new URL(req.url).searchParams.get("disposition") === "inline");
  const disposition = tipoInline ? "inline" : "attachment";
  await logAudit({
    modulo: "portal",
    acao: "aprovacao-entrega-comprovante-baixado",
    resultado: "sucesso",
    userId: user.id,
    entidade: "ComprovanteAprovacaoEntrega",
    entidadeId: comprovanteId,
    detalhe: { disposition },
    ip: await getClientIp(),
  });
  const headers = new Headers({
    "Content-Length": String(arquivo.tamanho),
    "Content-Type": tipoInline ?? "application/octet-stream",
    "Content-Disposition": contentDisposition(disposition, c.nome),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": SEM_CACHE,
  });
  return new NextResponse(arquivo.abrir(), { headers });
}
