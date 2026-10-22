import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { gravarRespostasBriefing } from "@/modules/inputs/briefing-service";
import { linkVigente } from "@/lib/link-publico";
import { auditarBloqueioRateLimit, limitarRequisicao, respostaLimiteRequisicoes } from "@/lib/rate-limit";
import { notificarPreenchimentoInput } from "@/modules/inputs/notificar-preenchimento";

const putSchema = z.object({ respostas: z.record(z.string(), z.unknown()).default({}) });

async function projetoDoToken(token: string) {
  const link = await prisma.linkPublicoInput.findUnique({
    where: { token },
    include: { projeto: { select: { id: true } } },
  });
  if (!link || !linkVigente(link)) return null;
  return link.projeto;
}

/** Salva o briefing de Start preenchido pelo cliente via link público (sem login). */
export async function PUT(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const limite = limitarRequisicao(req, {
    escopo: "briefing-publico-gravacao",
    identificador: "publico",
    maximo: 120,
    janelaMs: 10 * 60_000,
  });
  if (!limite.permitido) {
    await auditarBloqueioRateLimit(limite, { modulo: "inputs", acao: "responder-briefing-publico", entidade: "LinkPublicoInput" });
    return respostaLimiteRequisicoes(limite);
  }
  const projeto = await projetoDoToken(token);
  if (!projeto) return NextResponse.json({ error: "Link inválido." }, { status: 404 });

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  // Só o e-mail/telefone que MUDOU é validado; o inválido já gravado segue salvando. `campos` leva a
  // mensagem por campo (chave da resposta) para a tela marcar o campo; `error` é o formato de sempre.
  const r = await gravarRespostasBriefing(projeto.id, parsed.data.respostas, "Cliente (link público)");
  if (!r.ok) return NextResponse.json({ error: r.erro, campos: r.campos }, { status: 400 });
  const status = r.status;
  // Só a TRANSIÇÃO para completo fura a janela de 6 h; o resto é aviso de "mexeu".
  const concluiu = status === "completo" && r.statusAnterior !== "completo";
  await notificarPreenchimentoInput(projeto.id, concluiu ? "completo" : "parcial");
  return NextResponse.json({ ok: true, status });
}
