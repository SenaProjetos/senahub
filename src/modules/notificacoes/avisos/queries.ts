import "server-only";
import { prisma } from "@/lib/prisma";
import { statusAviso } from "./agendamento";
import { alvoLabel } from "./alvo-label";
import { avisoRecebidoDe, type AvisoRecebido } from "./recebidos";

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

const INCLUDE_RECEBIDO = {
  aviso: {
    select: {
      titulo: true,
      corpo: true,
      imagemPath: true,
      exigeConfirmacao: true,
      enviadoEm: true,
      criadoPor: { select: { name: true } },
    },
  },
} as const;

/**
 * Avisos que o usuário recebeu, do mais novo ao mais antigo (`/avisos`, aba Recebidos).
 * Só leitura: não marca `entregueEm` — isso é do modal (`avisosPendentes`).
 */
export async function meusAvisos(
  userId: string,
  { skip, take }: { skip: number; take: number },
): Promise<{ itens: AvisoRecebido[]; total: number }> {
  const [rows, total] = await Promise.all([
    prisma.avisoDestinatario.findMany({
      where: { userId },
      include: INCLUDE_RECEBIDO,
      orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
      skip,
      take,
    }),
    prisma.avisoDestinatario.count({ where: { userId } }),
  ]);
  return { itens: rows.map(avisoRecebidoDe), total };
}

/** Um aviso recebido pelo usuário (`/avisos?aviso=<id>`, link da notificação); null se não é dele. */
export async function meuAviso(userId: string, avisoId: string): Promise<AvisoRecebido | null> {
  const row = await prisma.avisoDestinatario.findUnique({
    where: { avisoId_userId: { avisoId, userId } },
    include: INCLUDE_RECEBIDO,
  });
  return row ? avisoRecebidoDe(row) : null;
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
