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

/** Resumo financeiro do cliente: receitas vinculadas (total / pago / em aberto). */
export async function resumoFinanceiroCliente(clienteId: string) {
  const lancamentos = await prisma.lancamento.findMany({
    where: { clienteId, tipo: "receita", status: { not: "cancelado" } },
    select: { valor: true, valorEfetivo: true, status: true },
  });
  let total = 0;
  let pago = 0;
  for (const l of lancamentos) {
    const v = Number(l.valorEfetivo ?? l.valor);
    total += v;
    if (l.status === "confirmado") pago += v;
  }
  return { total, pago, emAberto: total - pago };
}

export type ClienteListItem = Awaited<ReturnType<typeof listarClientes>>[number];
export type ClienteDetalhe = NonNullable<Awaited<ReturnType<typeof obterCliente>>>;
export type ContatoItem = ClienteDetalhe["contatos"][number];
