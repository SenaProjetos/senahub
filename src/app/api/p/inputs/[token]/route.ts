import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { linkVigente } from "@/lib/link-publico";
import { auditarBloqueioRateLimit, limitarRequisicao, respostaLimiteRequisicoes } from "@/lib/rate-limit";
import { notificarPreenchimentoInput } from "@/modules/inputs/notificar-preenchimento";

const putSchema = z.object({
  respostas: z.array(z.object({ id: z.string(), resposta: z.string() })),
});

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
    where: { projetoId: projeto.id },
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

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  // Só permite gravar respostas de inputs DESTE projeto.
  const ids = new Set(
    (await prisma.inputProjeto.findMany({ where: { projetoId: projeto.id }, select: { id: true } })).map(
      (i) => i.id,
    ),
  );
  const validas = parsed.data.respostas.filter((r) => ids.has(r.id));

  await prisma.$transaction(
    validas.map((r) =>
      prisma.inputProjeto.update({ where: { id: r.id }, data: { resposta: r.resposta || null } }),
    ),
  );
  // Avisa a equipe (janela de 6 h — o formulário salva sozinho a cada campo).
  if (validas.length > 0) await notificarPreenchimentoInput(projeto.id, "parcial");
  return NextResponse.json({ ok: true, salvos: validas.length });
}
