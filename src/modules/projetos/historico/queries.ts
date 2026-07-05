import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/** Ações de documentos consideradas no histórico (CDE) do projeto. */
const ACOES_DOCUMENTO = [
  "enviar-arquivos",
  "validar-entrega",
  "validar-arquivo",
  "reverter-validacao-arquivo",
  "solicitar-ajuste-arquivo",
  "gerar-aceite-cliente",
  "renomear-arquivo",
  "criar-prancha",
  "editar-prancha",
  "excluir-prancha",
  "importar-pranchas",
  "criar-arquivo",
  "editar-arquivo",
  "excluir-arquivo",
  "adicionar-versao-arquivo",
];

/**
 * Histórico (CDE) de documentos de um projeto: eventos de AuditLog cujas ações são de
 * arquivos/pranchas e cujo `entidadeId` cai no projeto (disciplinas, uploads, repo geral).
 * Depende da padronização de `entidadeId` nas actions (disciplinaId / projetoId / uploadId).
 */
export async function historicoDocumentosProjeto(
  projetoId: string,
  opts?: { page?: number; take?: number },
) {
  const page = Math.max(1, opts?.page ?? 1);
  const take = opts?.take ?? 50;

  const [disciplinas, arquivos] = await Promise.all([
    prisma.disciplina.findMany({ where: { projetoId }, select: { id: true } }),
    prisma.arquivoProjeto.findMany({ where: { projetoId }, select: { id: true, versoes: { select: { id: true } } } }),
  ]);
  const disciplinaIds = disciplinas.map((d) => d.id);
  const uploads = disciplinaIds.length
    ? await prisma.upload.findMany({ where: { disciplinaId: { in: disciplinaIds } }, select: { id: true } })
    : [];

  const ids = [
    projetoId,
    ...disciplinaIds,
    ...uploads.map((u) => u.id),
    ...arquivos.map((a) => a.id),
    ...arquivos.flatMap((a) => a.versoes.map((v) => v.id)),
  ];

  const where: Prisma.AuditLogWhereInput = {
    modulo: { in: ["uploads", "projetos"] },
    acao: { in: ACOES_DOCUMENTO },
    entidadeId: { in: ids },
  };

  const [rows, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
      select: {
        id: true,
        acao: true,
        modulo: true,
        resultado: true,
        entidade: true,
        detalhe: true,
        createdAt: true,
        userId: true,
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const userIds = [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const nomeAutor = new Map(users.map((u) => [u.id, u.name]));

  return {
    total,
    page,
    take,
    pageCount: Math.max(1, Math.ceil(total / take)),
    itens: rows.map((r) => ({
      id: r.id,
      acao: r.acao,
      resultado: r.resultado,
      entidade: r.entidade,
      autor: r.userId ? (nomeAutor.get(r.userId) ?? "—") : "sistema",
      quando: r.createdAt.toISOString(),
      detalhe: r.detalhe as Record<string, unknown> | null,
    })),
  };
}

export type HistoricoProjeto = Awaited<ReturnType<typeof historicoDocumentosProjeto>>;
export type HistoricoItem = HistoricoProjeto["itens"][number];
