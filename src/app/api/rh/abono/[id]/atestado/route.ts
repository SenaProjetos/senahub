import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { lerArquivo } from "@/lib/storage";
import { HR_ADMIN_ROLES } from "@/lib/roles";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  const { id } = await ctx.params;

  const abono = await prisma.abonoFalta.findUnique({ where: { id } });
  if (!abono || !abono.atestadoPath) {
    return NextResponse.json({ error: "Atestado não encontrado." }, { status: 404 });
  }
  // Dono ou gestor de RH.
  const ehGestor = HR_ADMIN_ROLES.includes(user.role);
  if (abono.userId !== user.id && !ehGestor) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(abono.atestadoPath);
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível." }, { status: 410 });
  }
  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Disposition": `attachment; filename="${encodeURIComponent(abono.atestadoNome ?? "atestado")}"`,
    },
  });
}
