import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { calcularStatusBriefing } from "@/modules/inputs/briefing-schema";

const putSchema = z.object({ respostas: z.record(z.string(), z.unknown()).default({}) });

async function projetoDoToken(token: string) {
  const link = await prisma.linkPublicoInput.findUnique({
    where: { token },
    include: { projeto: { select: { id: true } } },
  });
  if (!link || !link.ativo) return null;
  return link.projeto;
}

/** Salva o briefing de Start preenchido pelo cliente via link público (sem login). */
export async function PUT(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const projeto = await projetoDoToken(token);
  if (!projeto) return NextResponse.json({ error: "Link inválido." }, { status: 404 });

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const respostas = parsed.data.respostas;
  const status = calcularStatusBriefing(respostas);
  const respostasJson = respostas as unknown as Prisma.InputJsonValue;
  await prisma.briefingProjeto.upsert({
    where: { projetoId: projeto.id },
    create: { projetoId: projeto.id, respostasJson, status, preenchidoPor: "Cliente (link público)", preenchidoEm: new Date() },
    update: { respostasJson, status, preenchidoPor: "Cliente (link público)", preenchidoEm: new Date() },
  });
  return NextResponse.json({ ok: true, status });
}
