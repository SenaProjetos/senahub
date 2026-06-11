import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export async function listarClientes(opts?: { q?: string; incluirInativos?: boolean }) {
  const where: Prisma.ClienteWhereInput = {};
  if (!opts?.incluirInativos) where.ativo = true;
  if (opts?.q) {
    where.OR = [
      { nome: { contains: opts.q, mode: "insensitive" } },
      { nomeFantasia: { contains: opts.q, mode: "insensitive" } },
      { documento: { contains: opts.q, mode: "insensitive" } },
    ];
  }
  return prisma.cliente.findMany({
    where,
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    include: { _count: { select: { contatos: true } } },
  });
}

export async function obterCliente(id: string) {
  return prisma.cliente.findUnique({
    where: { id },
    include: { contatos: { orderBy: [{ principal: "desc" }, { nome: "asc" }] } },
  });
}

/**
 * Resumo financeiro do cliente (valor total / pago / em aberto).
 * Stub na Onda 1 — preenchido quando o Financeiro entrar (Onda 2).
 */
export async function resumoFinanceiroCliente(clienteId: string) {
  void clienteId;
  return { total: 0, pago: 0, emAberto: 0 };
}

export type ClienteListItem = Awaited<ReturnType<typeof listarClientes>>[number];
export type ClienteDetalhe = NonNullable<Awaited<ReturnType<typeof obterCliente>>>;
export type ContatoItem = ClienteDetalhe["contatos"][number];
