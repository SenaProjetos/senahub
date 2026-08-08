import "server-only";
import { prisma } from "@/lib/prisma";

/** Tudo que a tela principal de certidões precisa, num só carregamento (poucas dezenas de linhas). */
export async function dadosDaTela() {
  const [certidoes, tipos, responsaveisPossiveis, links] = await Promise.all([
    prisma.certidao.findMany({
      orderBy: { validade: "asc" },
      include: {
        tipo: true,
        responsavel: { select: { id: true, name: true } },
        versoes: { orderBy: { numero: "desc" } },
      },
    }),
    prisma.certidaoTipo.findMany({ orderBy: { nome: "asc" } }),
    prisma.user.findMany({
      where: { ativo: true, role: { in: ["admin", "supervisor", "administrativo"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.linkPublicoCertidoes.findMany({ orderBy: { createdAt: "desc" } }),
  ]);

  const certidaoIds = certidoes.map((c) => c.id);
  const versaoIds = certidoes.flatMap((c) => c.versoes.map((v) => v.id));

  const [auditLogs, habilitacoes] = await Promise.all([
    certidaoIds.length + versaoIds.length > 0
      ? prisma.auditLog.findMany({
          where: { entidade: { in: ["Certidao", "CertidaoVersao"] }, entidadeId: { in: [...certidaoIds, ...versaoIds] } },
          orderBy: { createdAt: "desc" },
          select: { id: true, acao: true, resultado: true, entidade: true, entidadeId: true, userId: true, createdAt: true },
        })
      : Promise.resolve([]),
    certidaoIds.length > 0
      ? prisma.licitacaoHabilitacaoItem.findMany({
          where: { certidaoId: { in: certidaoIds } },
          include: { licitacao: { select: { id: true, titulo: true, status: true } } },
        })
      : Promise.resolve([]),
  ]);

  const versaoIdParaCertidaoId = new Map(certidoes.flatMap((c) => c.versoes.map((v) => [v.id, c.id] as const)));

  const userIds = [...new Set(auditLogs.map((a) => a.userId).filter((id): id is string => !!id))];
  const usuarios = userIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const nomeDoUsuario = new Map(usuarios.map((u) => [u.id, u.name]));

  return { certidoes, tipos, responsaveisPossiveis, links, auditLogs, habilitacoes, versaoIdParaCertidaoId, nomeDoUsuario };
}
