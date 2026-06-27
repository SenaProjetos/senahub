import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { secaoDoPath } from "@/modules/auditoria/uso";

/**
 * Beacon de navegação: registra um page-view (AcessoPagina) por mudança de rota.
 * Dado interno de colaboradores, para a análise de uso (admin). Clientes são
 * ignorados. Best-effort — nunca quebra a navegação.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  if (session.user.role === "cliente") return NextResponse.json({ ok: true });

  let path = "";
  try {
    const body = (await req.json()) as { path?: unknown };
    if (typeof body.path === "string") path = body.path;
  } catch {
    /* corpo inválido */
  }
  if (!path.startsWith("/")) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    await prisma.acessoPagina.create({
      data: { userId: session.user.id, secao: secaoDoPath(path), path: path.slice(0, 300) },
    });
  } catch {
    /* best-effort */
  }
  return NextResponse.json({ ok: true });
}
