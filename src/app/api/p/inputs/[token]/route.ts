import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { linkVigente } from "@/lib/link-publico";
import { auditarBloqueioRateLimit, limitarRequisicao, respostaLimiteRequisicoes } from "@/lib/rate-limit";
import { gravarRespostasExtras } from "@/modules/inputs/extras-service";
import { notificarPreenchimentoInput } from "@/modules/inputs/notificar-preenchimento";
import { LIMITE_TEXTO_RESPOSTA } from "@/modules/inputs/briefing-schema";
import { lerJsonLimitado } from "@/lib/corpo-limitado";

// O link é aberto ao mundo: lista e texto com teto (o mesmo da resposta do briefing).
const putSchema = z.object({
  respostas: z.array(z.object({ id: z.string().max(64), resposta: z.string().max(LIMITE_TEXTO_RESPOSTA) })).max(200),
});

const LIMITE_CORPO_BYTES = 512 * 1024;

async function projetoDoToken(token: string) {
  const link = await prisma.linkPublicoInput.findUnique({
    where: { token },
    include: { projeto: { select: { id: true, nome: true, codigo: true } } },
  });
  if (!link || !linkVigente(link)) return null;
  return link.projeto;
}

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const limite = limitarRequisicao(req, {
    escopo: "inputs-publicos-leitura",
    identificador: "publico",
    maximo: 120,
    janelaMs: 5 * 60_000,
  });
  if (!limite.permitido) {
    await auditarBloqueioRateLimit(limite, { modulo: "inputs", acao: "consultar-link-publico", entidade: "LinkPublicoInput" });
    return respostaLimiteRequisicoes(limite);
  }
  const projeto = await projetoDoToken(token);
  if (!projeto) return NextResponse.json({ error: "Link inválido." }, { status: 404 });

  const itens = await prisma.inputProjeto.findMany({
    where: { projetoId: projeto.id, removidoEm: null },
    orderBy: [{ disciplina: "asc" }, { ordem: "asc" }, { createdAt: "asc" }],
    select: { id: true, disciplina: true, pergunta: true, resposta: true },
  });
  return NextResponse.json({ projeto: { nome: projeto.nome, codigo: projeto.codigo }, itens });
}

export async function PUT(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const limite = limitarRequisicao(req, {
    escopo: "inputs-publicos-gravacao",
    identificador: "publico",
    maximo: 300,
    janelaMs: 10 * 60_000,
  });
  if (!limite.permitido) {
    await auditarBloqueioRateLimit(limite, { modulo: "inputs", acao: "responder-link-publico", entidade: "LinkPublicoInput" });
    return respostaLimiteRequisicoes(limite);
  }
  const projeto = await projetoDoToken(token);
  if (!projeto) return NextResponse.json({ error: "Link inválido." }, { status: 404 });

  // Teto de bytes lido em fluxo (o corpo em pedaços não traz Content-Length): o limite de chaves só vale depois do
  // parse, e o processo é um só (chat incluso).
  const corpo = await lerJsonLimitado(req, LIMITE_CORPO_BYTES);
  if (!corpo.ok) return NextResponse.json({ error: corpo.erro }, { status: corpo.status });
  const parsed = putSchema.safeParse(corpo.dados);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  // Só grava em input ATIVO deste projeto (o serviço escopa por projeto e removida) e obedece à regra do canal
  // (pedido encerrado pela equipe → recusa), tudo na mesma transação.
  const r = await gravarRespostasExtras(projeto.id, parsed.data.respostas, "link");
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 409 });
  // Avisa a equipe (janela de 6 h — o formulário salva sozinho a cada campo).
  if (r.salvas > 0) await notificarPreenchimentoInput(projeto.id, "parcial", "link");
  return NextResponse.json({ ok: true, salvos: r.salvas });
}
