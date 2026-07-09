import "server-only";
import { prisma } from "@/lib/prisma";

export type AvisoPendente = {
  avisoId: string;
  titulo: string;
  corpo: string | null;
  exigeConfirmacao: boolean;
  criadoEm: Date;
};

/**
 * Avisos ainda não confirmados pelo usuário (fila do modal). Marca `entregueEm`
 * na primeira vez que aparecem — registro de "foi exibido".
 */
export async function avisosPendentes(userId: string): Promise<AvisoPendente[]> {
  const rows = await prisma.avisoDestinatario.findMany({
    where: { userId, lidoEm: null },
    include: { aviso: true },
    orderBy: { criadoEm: "asc" },
  });

  const naoEntregues = rows.filter((r) => !r.entregueEm).map((r) => r.id);
  if (naoEntregues.length > 0) {
    await prisma.avisoDestinatario.updateMany({
      where: { id: { in: naoEntregues } },
      data: { entregueEm: new Date() },
    });
  }

  return rows.map((r) => ({
    avisoId: r.avisoId,
    titulo: r.aviso.titulo,
    corpo: r.aviso.corpo,
    exigeConfirmacao: r.aviso.exigeConfirmacao,
    criadoEm: r.criadoEm,
  }));
}

/** Lista de avisos enviados com contagem de confirmações (registro admin). */
export async function listarAvisos() {
  const [avisos, confirmados] = await Promise.all([
    prisma.aviso.findMany({
      orderBy: { criadoEm: "desc" },
      include: {
        criadoPor: { select: { name: true } },
        _count: { select: { destinatarios: true } },
      },
    }),
    prisma.avisoDestinatario.groupBy({
      by: ["avisoId"],
      where: { lidoEm: { not: null } },
      _count: true,
    }),
  ]);
  const mapaConf = new Map(confirmados.map((c) => [c.avisoId, c._count]));
  return avisos.map((a) => ({
    id: a.id,
    titulo: a.titulo,
    corpo: a.corpo,
    criadoEm: a.criadoEm,
    autor: a.criadoPor.name,
    alvoTipo: a.alvoTipo,
    alvoRoles: a.alvoRoles,
    exigeConfirmacao: a.exigeConfirmacao,
    enviouEmail: a.enviouEmail,
    total: a._count.destinatarios,
    confirmados: mapaConf.get(a.id) ?? 0,
  }));
}

/** Detalhe de um aviso: quem recebeu, quem leu e quando. */
export async function detalheAviso(id: string) {
  return prisma.aviso.findUnique({
    where: { id },
    include: {
      criadoPor: { select: { name: true } },
      destinatarios: {
        include: { user: { select: { name: true, email: true, role: true } } },
        orderBy: [{ lidoEm: "asc" }, { criadoEm: "asc" }],
      },
    },
  });
}
