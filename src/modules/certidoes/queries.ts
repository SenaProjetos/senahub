import "server-only";
import { prisma } from "@/lib/prisma";
import { whereAudiencia } from "@/lib/audiencias";
import { janelaAtencaoUtc } from "./service";

export type AtencaoCertidoes = { vencidas: number; venceEmBreve: number };

/**
 * Só os DOIS contadores do badge do menu e do card do Início — não a tela inteira.
 *
 * Roda no layout do dashboard, ou seja, em TODA navegação: por isso é `count` (índice de
 * `validade`) e não uma leitura hidratada passada pelo `panoramaCompliance`.
 *
 * As fronteiras vêm de `janelaAtencaoUtc` (service.ts, pura e testada) para o SQL contar
 * EXATAMENTE o que `statusCertidao` classificaria — se divergir, o badge diz 3 e a tela mostra 2.
 *
 * Certidão excluída (soft delete) não conta: `count` é leitura top-level e a extensão de
 * `lib/prisma.ts` já injeta `excluidoEm: null`.
 */
export async function contarCertidoesAtencao(): Promise<AtencaoCertidoes> {
  const { hojeUtc, limiteUtc } = janelaAtencaoUtc();

  const [vencidas, venceEmBreve] = await Promise.all([
    prisma.certidao.count({ where: { validade: { lt: hojeUtc } } }),
    prisma.certidao.count({ where: { validade: { gte: hojeUtc, lte: limiteUtc } } }),
  ]);

  return { vencidas, venceEmBreve };
}

/** Tudo que a tela principal de certidões precisa, num só carregamento (poucas dezenas de linhas). */
export async function dadosDaTela() {
  const [certidoes, excluidas, tipos, responsaveisPossiveis, links] = await Promise.all([
    prisma.certidao.findMany({
      orderBy: { validade: "asc" },
      include: {
        tipo: true,
        responsavel: { select: { id: true, name: true } },
        versoes: { orderBy: { numero: "desc" } },
      },
    }),
    // Escape hatch (ver lib/prisma.ts): `excluidoEm: { not: null }` = só as arquivadas,
    // p/ a aba "Excluídas" (restaurar) — a lista principal acima já vem só com as ativas.
    prisma.certidao.findMany({
      where: { excluidoEm: { not: null } },
      orderBy: { excluidoEm: "desc" },
      include: { tipo: true },
    }),
    prisma.certidaoTipo.findMany({ orderBy: { nome: "asc" } }),
    prisma.user.findMany({
      where: whereAudiencia("gestao_operacional"),
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.linkPublicoCertidoes.findMany({ orderBy: { createdAt: "desc" } }),
  ]);

  const certidaoIds = certidoes.map((c) => c.id);
  const versaoIds = certidoes.flatMap((c) => c.versoes.map((v) => v.id));
  const excluidaIds = excluidas.map((c) => c.id);

  const [auditLogs, habilitacoes, auditLogsExclusao] = await Promise.all([
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
    // Quem excluiu cada certidão arquivada — a lista principal de `auditLogs` acima só
    // cobre as ATIVAS, e a aba "Excluídas" não tem sheet de detalhes própria pra buscar
    // isso na hora; sem este join a auditoria "some" da UI (mesmo continuando no banco).
    excluidaIds.length > 0
      ? prisma.auditLog.findMany({
          where: { entidade: "Certidao", entidadeId: { in: excluidaIds }, acao: "excluir-certidao" },
          orderBy: { createdAt: "desc" },
          select: { entidadeId: true, userId: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);

  const versaoIdParaCertidaoId = new Map(certidoes.flatMap((c) => c.versoes.map((v) => [v.id, c.id] as const)));

  // Inclui os autores das VERSÕES (§11 do plano de UI: "Adicionada por X" na timeline do drawer).
  // Entram no mesmo `findMany` dos usuários da auditoria — resolver nome de versão à parte seria
  // uma segunda consulta para a mesma tabela.
  const userIds = [
    ...new Set(
      [
        ...auditLogs.map((a) => a.userId),
        ...auditLogsExclusao.map((a) => a.userId),
        ...certidoes.flatMap((c) => c.versoes.map((v) => v.autorId)),
      ].filter((id): id is string => !!id),
    ),
  ];
  const usuarios = userIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const nomeDoUsuario = new Map(usuarios.map((u) => [u.id, u.name]));

  // Mais recente primeiro (já vem ordenado desc) → primeiro hit por certidão é o registro certo.
  const excluidoPorCertidao = new Map<string, { userId: string | null; createdAt: Date }>();
  for (const a of auditLogsExclusao) {
    if (a.entidadeId && !excluidoPorCertidao.has(a.entidadeId)) excluidoPorCertidao.set(a.entidadeId, a);
  }

  return {
    certidoes,
    excluidas,
    tipos,
    responsaveisPossiveis,
    links,
    auditLogs,
    habilitacoes,
    versaoIdParaCertidaoId,
    nomeDoUsuario,
    excluidoPorCertidao,
  };
}
