import { prisma } from "@/lib/prisma";
import { ExecutionCapacityError } from "@/lib/execution-limit";
import { auditarBloqueioRateLimit, limitarRequisicao, respostaLimiteRequisicoes } from "@/lib/rate-limit";
import { gerarPdfDaPaginaPublica, pdfArquivadoDaProposta } from "@/modules/comercial/pdf-proposta";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * PDF público da proposta — acesso por token (sem login), equivalente ao `/a/proposta/[token]`.
 *
 * ── F5.13: serve o ARQUIVADO quando existe ──────────────────────────────────────────────────
 * Se a versão vigente foi enviada e teve o PDF congelado, é ele que sai — o cliente baixa o
 * documento que recebeu, não uma re-renderização do estado de hoje. Sem arquivado (proposta
 * anterior à F5.13, ou nunca enviada), cai na geração ao vivo, exatamente como sempre funcionou.
 * Esse fallback é o que dispensa backfill: nada muda para o que já existe.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const limite = limitarRequisicao(req, {
    escopo: "proposta-publica-pdf",
    identificador: "publico",
    maximo: 10,
    janelaMs: 10 * 60_000,
  });
  if (!limite.permitido) {
    await auditarBloqueioRateLimit(limite, { modulo: "comercial", acao: "gerar-pdf-publico", entidade: "Proposta" });
    return respostaLimiteRequisicoes(limite);
  }

  const p = await prisma.proposta.findUnique({
    where: { token },
    select: { id: true, numero: true, titulo: true },
  });
  if (!p) return new Response("Proposta não encontrada.", { status: 404 });

  const nome = `${p.numero} — ${p.titulo}`;
  const headers = (extra: Record<string, string> = {}) => ({
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${encodeURIComponent(nome)}.pdf"`,
    ...extra,
  });

  const arquivado = await pdfArquivadoDaProposta(p.id);
  if (arquivado) {
    return new Response(new Uint8Array(arquivado.buffer), {
      // Deixa explícito qual versão está sendo servida — sem isto, "o PDF mudou?" vira
      // investigação de storage em vez de uma olhada no cabeçalho.
      headers: headers({ "X-Proposta-Versao": String(arquivado.versao) }),
    });
  }

  try {
    const pdf = await gerarPdfDaPaginaPublica(token);
    return new Response(new Uint8Array(pdf), { headers: headers() });
  } catch (e) {
    if (e instanceof ExecutionCapacityError) {
      return new Response("Servidor ocupado. Tente novamente em instantes.", { status: 503, headers: headers({ "Retry-After": "15" }) });
    }
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("CHROME_PATH")) {
      return new Response("CHROME_PATH não configurado no servidor.", { status: 503 });
    }
    return new Response("Falha ao gerar o PDF.", { status: 500 });
  }
}
