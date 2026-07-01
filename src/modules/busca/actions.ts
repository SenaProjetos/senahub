"use server";

import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { escopoProjeto } from "@/modules/projetos/queries";
import { buscarManual } from "@/lib/manual";

export type ResultadoBusca = {
  projetos: { id: string; codigo: string; nome: string }[];
  clientes: { id: string; nome: string }[];
  tarefas: { id: string; titulo: string }[];
  lancamentos: { id: string; descricao: string; valor: number; tipo: string }[];
  documentos: { id: string; nome: string }[];
  licitacoes: { id: string; titulo: string }[];
  propostas: { id: string; numero: string; titulo: string }[];
  /** Páginas do Manual/Ajuda (documentação, não registros do sistema). */
  ajuda: { path: string; titulo: string; descricao: string }[];
};

const VAZIO: ResultadoBusca = {
  projetos: [],
  clientes: [],
  tarefas: [],
  lancamentos: [],
  documentos: [],
  licitacoes: [],
  propostas: [],
  ajuda: [],
};

/** Busca global (Ctrl+K): projetos (escopo), clientes, tarefas, lançamentos e modelos de documento (por permissão). */
export async function buscaGlobal(termo: string): Promise<ResultadoBusca> {
  const t = termo.trim();
  if (t.length < 2) return VAZIO;

  const user = await requireUser();
  const digits = t.replace(/\D/g, "");
  const [podeClientes, podeTarefas, podeFin, podeDocs, podeLic, podeCom] = await Promise.all([
    can(user.role, "clientes", "ver"),
    can(user.role, "tarefas", "ver"),
    can(user.role, "financeiro", "ver"),
    can(user.role, "documentos", "ver"),
    can(user.role, "licitacoes", "ver"),
    can(user.role, "comercial", "ver"),
  ]);

  const [projetos, clientes, tarefas, lancamentos, documentos, licitacoes, propostas, ajuda] = await Promise.all([
    prisma.projeto.findMany({
      where: {
        AND: [
          escopoProjeto(user),
          {
            OR: [
              { nome: { contains: t, mode: "insensitive" } },
              ...(digits ? [{ codigo: { contains: digits } }] : []),
              { cliente: { nome: { contains: t, mode: "insensitive" } } },
            ],
          },
        ],
      },
      take: 6,
      orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
      select: { id: true, codigo: true, nome: true },
    }),
    podeClientes
      ? prisma.cliente.findMany({
          where: { nome: { contains: t, mode: "insensitive" } },
          take: 6,
          orderBy: { nome: "asc" },
          select: { id: true, nome: true },
        })
      : Promise.resolve([]),
    podeTarefas
      ? prisma.tarefa.findMany({
          where: { arquivada: false, titulo: { contains: t, mode: "insensitive" } },
          take: 6,
          orderBy: { createdAt: "desc" },
          select: { id: true, titulo: true },
        })
      : Promise.resolve([]),
    podeFin
      ? prisma.lancamento.findMany({
          where: { descricao: { contains: t, mode: "insensitive" } },
          take: 6,
          orderBy: { data: "desc" },
          select: { id: true, descricao: true, valor: true, tipo: true },
        })
      : Promise.resolve([]),
    podeDocs
      ? prisma.documentoModelo.findMany({
          where: { nome: { contains: t, mode: "insensitive" } },
          take: 6,
          orderBy: { nome: "asc" },
          select: { id: true, nome: true },
        })
      : Promise.resolve([]),
    podeLic
      ? prisma.licitacao.findMany({
          where: { titulo: { contains: t, mode: "insensitive" } },
          take: 6,
          orderBy: { updatedAt: "desc" },
          select: { id: true, titulo: true },
        })
      : Promise.resolve([]),
    podeCom
      ? prisma.proposta.findMany({
          where: {
            OR: [
              { titulo: { contains: t, mode: "insensitive" } },
              ...(digits ? [{ numero: { contains: digits } }] : []),
            ],
          },
          take: 6,
          orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
          select: { id: true, numero: true, titulo: true },
        })
      : Promise.resolve([]),
    // Manual/Ajuda: público a logados (sem gate de permissão).
    buscarManual(t),
  ]);

  return {
    projetos,
    clientes,
    tarefas,
    documentos,
    lancamentos: lancamentos.map((l) => ({
      id: l.id,
      descricao: l.descricao,
      valor: Number(l.valor),
      tipo: l.tipo,
    })),
    licitacoes,
    propostas,
    ajuda,
  };
}
