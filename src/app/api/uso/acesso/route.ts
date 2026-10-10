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
  if (session.user.tipo === "externo") return NextResponse.json({ ok: true });

  let path = "";
  let dispositivo: "celular" | "computador" | null = null;
  try {
    const body = (await req.json()) as { path?: unknown; dispositivo?: unknown };
    if (typeof body.path === "string") path = body.path;
    if (body.dispositivo === "celular" || body.dispositivo === "computador") dispositivo = body.dispositivo;
  } catch {
    /* corpo inválido */
  }
  if (!path.startsWith("/")) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    await prisma.acessoPagina.create({
      data: { userId: session.user.id, secao: secaoDoPath(path), path: path.slice(0, 300), dispositivo },
    });
  } catch {
    /* best-effort */
  }
  return NextResponse.json({ ok: true });
}
