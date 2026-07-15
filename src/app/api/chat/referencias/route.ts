import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { INTERNAL_ROLES } from "@/lib/roles";

export type ReferenciaChat = { tipo: "projeto" | "documento"; id: string; rotulo: string; href: string };

/**
 * Busca leve de referências internas para o chat (Projeto/Documento), para inserir
 * um deep-link na mensagem. Restrito a perfis internos — evita vazar catálogo de
 * projetos/documentos para clientes/freelancers que também usam o chat (DMs).
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(INTERNAL_ROLES as readonly string[]).includes(session.user.role)) {
    return NextResponse.json({ referencias: [] });
  }
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();

  const [projetos, documentos] = await Promise.all([
    prisma.projeto.findMany({
      where: q
        ? { OR: [{ codigo: { contains: q } }, { nome: { contains: q, mode: "insensitive" } }] }
        : {},
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, codigo: true, nome: true },
    }),
    q.length >= 1
      ? prisma.documento.findMany({
          where: { nome: { contains: q, mode: "insensitive" } },
          orderBy: { createdAt: "desc" },
          take: 6,
          select: { id: true, nome: true },
        })
      : Promise.resolve([]),
  ]);

  const referencias: ReferenciaChat[] = [
    ...projetos.map((p) => ({
      tipo: "projeto" as const,
      id: p.id,
      rotulo: `${p.codigo} · ${p.nome}`,
      href: `/projetos/${p.id}`,
    })),
    ...documentos.map((d) => ({
      tipo: "documento" as const,
      id: d.id,
      rotulo: d.nome,
      href: `/documentos/${d.id}`,
    })),
  ];

  return NextResponse.json({ referencias });
}
