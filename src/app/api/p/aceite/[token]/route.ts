import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const postSchema = z.object({
  situacao: z.enum(["aceito", "revisao"]),
  observacao: z.string().optional(),
});

async function aceiteDoToken(token: string) {
  return prisma.aceiteCliente.findUnique({
    where: { token },
    select: {
      id: true,
      situacao: true,
      upload: {
        select: {
          nomeArquivo: true,
          pacote: true,
          disciplina: { select: { nome: true, projeto: { select: { codigo: true, nome: true } } } },
        },
      },
    },
  });
}

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const aceite = await aceiteDoToken(token);
  if (!aceite) return NextResponse.json({ error: "Link inválido." }, { status: 404 });

  const { upload } = aceite;
  return NextResponse.json({
    situacao: aceite.situacao,
    arquivo: upload.nomeArquivo,
    pacote: upload.pacote,
    disciplina: upload.disciplina.nome,
    projeto: { codigo: upload.disciplina.projeto.codigo, nome: upload.disciplina.projeto.nome },
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const aceite = await aceiteDoToken(token);
  if (!aceite) return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  if (aceite.situacao !== "pendente") {
    return NextResponse.json({ error: "Este aceite já foi respondido." }, { status: 409 });
  }

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  await prisma.aceiteCliente.update({
    where: { id: aceite.id },
    data: { situacao: parsed.data.situacao, respondidoEm: new Date(), observacao: parsed.data.observacao || null },
  });
  return NextResponse.json({ ok: true, situacao: parsed.data.situacao });
}
