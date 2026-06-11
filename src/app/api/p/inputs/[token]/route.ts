import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const putSchema = z.object({
  respostas: z.array(z.object({ id: z.string(), resposta: z.string() })),
});

async function projetoDoToken(token: string) {
  const link = await prisma.linkPublicoInput.findUnique({
    where: { token },
    include: { projeto: { select: { id: true, nome: true, codigo: true } } },
  });
  if (!link || !link.ativo) return null;
  return link.projeto;
}

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
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
  return NextResponse.json({ ok: true, salvos: validas.length });
}
