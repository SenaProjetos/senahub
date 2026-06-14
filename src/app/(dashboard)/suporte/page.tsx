import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { SuporteView } from "@/components/suporte/suporte-view";

export const metadata: Metadata = { title: "Suporte" };

export default async function SuportePage() {
  const user = await requireUser();
  const ehGestor = user.role === "admin" || HR_ADMIN_ROLES.includes(user.role);

  const tickets = await prisma.ticketSuporte.findMany({
    where: ehGestor ? {} : { autorId: user.id },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: {
      autor: { select: { name: true } },
      mensagens: { orderBy: { createdAt: "asc" }, include: { autor: { select: { name: true } } } },
    },
  });

  return (
    <SuporteView
      ehGestor={ehGestor}
      tickets={tickets.map((t) => ({
        id: t.id,
        titulo: t.titulo,
        descricao: t.descricao,
        status: t.status,
        autor: t.autor.name,
        criadoEm: t.createdAt.toISOString(),
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
