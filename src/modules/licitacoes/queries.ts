import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { STATUS_LICITACAO, type StatusLicitacao } from "./status";
import { PAGE_SIZE_PADRAO, PAGE_SIZES } from "./pagination";

export type LicitacaoFiltro = {
  /** Lista de status a incluir; vazio/ausente = todos. */
  status?: string[];
  /** Busca textual no órgão. */
  orgao?: string;
  /** Busca textual no título. */
  q?: string;
  page?: number;
  pageSize?: number;
};

export type LicitacaoListItem = {
  id: string;
  titulo: string;
  orgao: string | null;
  modalidade: string | null;
  numeroEdital: string | null;
  prazoProposta: string;
  valorEstimado: number | null;
  status: string;
  observacoes: string;
  projeto: { id: string; codigo: string } | null;
  docs: { id: string; titulo: string; versoes: { id: string; numero: number; arquivoNome: string }[] }[];
  medicoes: { id: string; numero: number; valor: number; data: string }[];
  historico: { id: string; descricao: string; data: string }[];
  valoresDisciplina: { id: string; disciplina: string; valor: number }[];
  eventos: { id: string; tipo: string; data: string; autoria: string | null; protocolo: string | null; observacao: string | null; concluido: boolean }[];
  composicao: { observacao: string | null; itens: { id: string; descricao: string; quantidade: number; valorUnitario: number; ordem: number }[] } | null;
};

function normalizarStatus(status?: string[]): StatusLicitacao[] {
  if (!status?.length) return [];
  return status.filter((s): s is StatusLicitacao =>
    (STATUS_LICITACAO as readonly string[]).includes(s),
  );
}

function normalizarPageSize(pageSize?: number): number {
  if (pageSize && (PAGE_SIZES as readonly number[]).includes(pageSize)) return pageSize;
  return PAGE_SIZE_PADRAO;
}

export async function listarLicitacoes(filtro: LicitacaoFiltro = {}) {
  const where: Prisma.LicitacaoWhereInput = {};

  const statusValidos = normalizarStatus(filtro.status);
  if (statusValidos.length) where.status = { in: statusValidos };
  if (filtro.orgao) where.orgao = { contains: filtro.orgao, mode: "insensitive" };
  if (filtro.q) where.titulo = { contains: filtro.q, mode: "insensitive" };

  const pageSize = normalizarPageSize(filtro.pageSize);
  const page = Math.max(1, filtro.page ?? 1);

  const [rows, total] = await Promise.all([
    prisma.licitacao.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: pageSize,
      skip: (page - 1) * pageSize,
      include: {
        projeto: { select: { id: true, codigo: true } },
        docs: { include: { versoes: { orderBy: { numero: "desc" } } } },
        medicoes: { orderBy: { numero: "asc" } },
        historico: { orderBy: { createdAt: "desc" }, take: 20 },
        valoresDisciplina: { orderBy: { disciplina: "asc" } },
        eventos: { orderBy: { data: "asc" } },
        composicao: { include: { itens: { orderBy: { ordem: "asc" } } } },
      },
    }),
    prisma.licitacao.count({ where }),
  ]);

  const items: LicitacaoListItem[] = rows.map((l) => ({
    id: l.id,
    titulo: l.titulo,
    orgao: l.orgao,
    modalidade: l.modalidade,
    numeroEdital: l.numeroEdital,
    prazoProposta: l.prazoProposta ? l.prazoProposta.toISOString().slice(0, 10) : "",
    valorEstimado: l.valorEstimado != null ? Number(l.valorEstimado) : null,
    status: l.status,
    observacoes: l.observacoes ?? "",
    projeto: l.projeto ? { id: l.projeto.id, codigo: l.projeto.codigo } : null,
    docs: l.docs.map((d) => ({
      id: d.id,
      titulo: d.titulo,
      versoes: d.versoes.map((v) => ({ id: v.id, numero: v.numero, arquivoNome: v.arquivoNome })),
    })),
    medicoes: l.medicoes.map((m) => ({
      id: m.id,
      numero: m.numero,
      valor: Number(m.valor),
      data: m.data.toISOString().slice(0, 10),
    })),
    historico: l.historico.map((h) => ({
      id: h.id,
      descricao: h.descricao,
      data: h.createdAt.toISOString(),
    })),
    valoresDisciplina: l.valoresDisciplina.map((v) => ({
      id: v.id,
      disciplina: v.disciplina,
      valor: Number(v.valor),
    })),
    eventos: l.eventos.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      data: e.data.toISOString().slice(0, 10),
      autoria: e.autoria,
      protocolo: e.protocolo,
      observacao: e.observacao,
      concluido: e.concluidoEm != null,
    })),
    composicao: l.composicao
      ? {
          observacao: l.composicao.observacao,
          itens: l.composicao.itens.map((it) => ({
            id: it.id,
            descricao: it.descricao,
            quantidade: Number(it.quantidade),
            valorUnitario: Number(it.valorUnitario),
            ordem: it.ordem,
          })),
        }
      : null,
  }));

  return {
    rows: items,
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
