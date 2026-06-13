"use server";

import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { escopoProjeto } from "@/modules/projetos/queries";

export type ResultadoBusca = {
  projetos: { id: string; codigo: string; nome: string }[];
  clientes: { id: string; nome: string }[];
  lancamentos: { id: string; descricao: string; valor: number; tipo: string }[];
};

/** Busca global (Ctrl+K): projetos (escopo do viewer), clientes e lançamentos (por permissão). */
export async function buscaGlobal(termo: string): Promise<ResultadoBusca> {
  const t = termo.trim();
  if (t.length < 2) return { projetos: [], clientes: [], lancamentos: [] };

  const user = await requireUser();
  const digits = t.replace(/\D/g, "");
  const [podeClientes, podeFin] = await Promise.all([
    can(user.role, "clientes", "ver"),
    can(user.role, "financeiro", "ver"),
  ]);

  const [projetos, clientes, lancamentos] = await Promise.all([
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
    podeFin
      ? prisma.lancamento.findMany({
          where: { descricao: { contains: t, mode: "insensitive" } },
          take: 6,
          orderBy: { data: "desc" },
          select: { id: true, descricao: true, valor: true, tipo: true },
        })
      : Promise.resolve([]),
  ]);

  return {
    projetos,
    clientes,
    lancamentos: lancamentos.map((l) => ({
      id: l.id,
      descricao: l.descricao,
      valor: Number(l.valor),
      tipo: l.tipo,
    })),
  };
}
