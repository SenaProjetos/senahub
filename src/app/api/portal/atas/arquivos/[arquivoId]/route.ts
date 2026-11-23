import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { arquivoParaStream } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";
import { contentDisposition } from "@/modules/projetos/arquivos/link-publico-regras";
import { arquivoParaEquipe } from "@/modules/portal/atas/service";

const SEM_CACHE = "private, no-store";

/**
 * Download de um arquivo interno da ata (anotações originais do Gemini ou transcrição). Só a equipe da audiência do
 * projeto; o cliente nunca baixa. Qualquer recusa — sem sessão, sem acesso, inexistente ou fora do disco — é o mesmo 404.
 * Sempre como anexo (.docx/.md/.txt), com `nosniff` e sem cache.
 */
const indisponivel = () => NextResponse.json({ error: "Arquivo indisponível." }, { status: 404, headers: { "Cache-Control": SEM_CACHE } });

export async function GET(_req: Request, ctx: { params: Promise<{ arquivoId: string }> }) {
  const { arquivoId } = await ctx.params;
  const session = await getSession();
  const user = session?.user ?? null;
  if (!user || user.tipo !== "interno") return indisponivel();
  const a = await arquivoParaEquipe(arquivoId, user.id);
  if (!a) return indisponivel();
  let arquivo: Awaited<ReturnType<typeof arquivoParaStream>>;
  try {
    arquivo = await arquivoParaStream(a.caminho);
  } catch {
    return indisponivel();
  }
  await logAudit({
    modulo: "portal",
    acao: "ata-arquivo-baixado",
    resultado: "sucesso",
    userId: user.id,
    entidade: "ArquivoAta",
    entidadeId: arquivoId,
    ip: await getClientIp(),
  });
  const headers = new Headers({
    "Content-Length": String(arquivo.tamanho),
    "Content-Type": "application/octet-stream",
    "Content-Disposition": contentDisposition("attachment", a.nome),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": SEM_CACHE,
  });
  return new NextResponse(arquivo.abrir(), { headers });
}
