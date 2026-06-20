import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { SuporteView } from "@/components/suporte/suporte-view";

export const metadata: Metadata = { title: "Suporte" };

export default async function SuportePage({
  searchParams,
}: {
  searchParams: Promise<{ escopo?: string }>;
}) {
  const user = await requireUser();
  const ehGestor = user.role === "admin" || HR_ADMIN_ROLES.includes(user.role);

  // Gestores podem alternar entre "meus" e "todos" (default: todos).
  // Demais usuários sempre veem apenas os próprios tickets.
  const { escopo: escopoParam } = await searchParams;
  const escopo: "meus" | "todos" = ehGestor && escopoParam !== "meus" ? "todos" : "meus";
  const apenasMeus = !ehGestor || escopo === "meus";

  const tickets = await prisma.ticketSuporte.findMany({
    where: apenasMeus ? { autorId: user.id } : {},
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: {
      autor: { select: { name: true } },
      mensagens: { orderBy: { createdAt: "asc" }, include: { autor: { select: { name: true } } } },
    },
  });

  return (
    <SuporteView
      ehGestor={ehGestor}
      escopo={escopo}
      tickets={tickets.map((t) => ({
        id: t.id,
        titulo: t.titulo,
        descricao: t.descricao,
        status: t.status,
        autor: t.autor.name,
        criadoEm: t.createdAt.toISOString(),
        atualizadoEm: t.updatedAt.toISOString(),
        mensagens: t.mensagens.map((m) => ({
          id: m.id,
          autor: m.autor.name,
          texto: m.texto,
          data: m.createdAt.toISOString(),
          anexoMime: m.anexoMime,
          anexoNome: m.anexoNome,
        })),
      }))}
    />
  );
}
