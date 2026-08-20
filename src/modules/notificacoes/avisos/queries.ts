import "server-only";
import { prisma } from "@/lib/prisma";
import { statusAviso } from "./agendamento";
import { alvoLabel } from "./alvo-label";

export type AvisoPendente = {
  avisoId: string;
  titulo: string;
  corpo: string | null;
  temImagem: boolean;
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
    temImagem: !!r.aviso.imagemPath,
    exigeConfirmacao: r.aviso.exigeConfirmacao,
    criadoEm: r.criadoEm,
  }));
}

/**
 * Registro de avisos (enviados, agendados e cancelados) com contagem de
 * confirmações. Um aviso agendado ainda não tem destinatários — o alvo só é
 * resolvido no disparo —, então `total`/`confirmados` vêm zerados de propósito e
 * a UI separa pelo `status`.
 */
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
  // Uma consulta para a lista inteira — o rótulo do alvo por perfil precisa do nome pt-BR.
  const perfis = await prisma.perfilAcesso.findMany({ select: { chave: true, nome: true } });
  const nomePorChavePerfil = Object.fromEntries(perfis.map((p) => [p.chave, p.nome]));
  return avisos.map((a) => ({
    id: a.id,
    titulo: a.titulo,
    corpo: a.corpo,
    criadoEm: a.criadoEm,
    agendadoPara: a.agendadoPara,
    enviadoEm: a.enviadoEm,
    canceladoEm: a.canceladoEm,
    status: statusAviso(a),
    autor: a.criadoPor.name,
    alvoTipo: a.alvoTipo,
    // Rótulo pronto: as telas não remontam o texto do alvo (eram duas cópias divergentes).
    alvoLabel: alvoLabel(a, nomePorChavePerfil),
    exigeConfirmacao: a.exigeConfirmacao,
    enviouEmail: a.enviouEmail,
    emailSolicitado: a.emailSolicitado,
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
