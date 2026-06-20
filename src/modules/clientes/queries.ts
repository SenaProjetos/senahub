import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { Dir } from "@/lib/list-params";

/** Campos ordenáveis na listagem de clientes (whitelist). */
const SORT_FIELDS = ["nome", "cidade", "createdAt"] as const;
type SortField = (typeof SORT_FIELDS)[number];

export type ListarClientesOpts = {
  q?: string;
  /** Mantido por compat: lista também inativos quando `situacao` não é informada. */
  incluirInativos?: boolean;
  tipo?: "PF" | "PJ";
  uf?: string;
  cidade?: string;
  /** "ativo" | "inativo" — filtra `ativo`. Quando ausente, segue `incluirInativos`. */
  situacao?: "ativo" | "inativo";
  sort?: string | null;
  dir?: Dir;
  skip?: number;
  take?: number;
};

function buildWhere(opts?: ListarClientesOpts): Prisma.ClienteWhereInput {
  const where: Prisma.ClienteWhereInput = {};

  if (opts?.situacao === "ativo") where.ativo = true;
  else if (opts?.situacao === "inativo") where.ativo = false;
  else if (!opts?.incluirInativos) where.ativo = true;

  if (opts?.tipo) where.tipo = opts.tipo;
  if (opts?.uf) where.uf = opts.uf;
  if (opts?.cidade) where.cidade = { equals: opts.cidade, mode: "insensitive" };

  if (opts?.q) {
    where.OR = [
      { nome: { contains: opts.q, mode: "insensitive" } },
      { nomeFantasia: { contains: opts.q, mode: "insensitive" } },
      { documento: { contains: opts.q, mode: "insensitive" } },
    ];
  }
  return where;
}

function buildOrderBy(opts?: ListarClientesOpts): Prisma.ClienteOrderByWithRelationInput {
  const sort: SortField = (SORT_FIELDS as readonly string[]).includes(opts?.sort ?? "")
    ? (opts!.sort as SortField)
    : "nome";
  const dir: Dir = opts?.dir === "desc" ? "desc" : "asc";
  return { [sort]: dir };
}

/**
 * Lista clientes (array). Mantém o contrato usado por outras telas (selects/option lists).
 * Aceita os mesmos filtros/ordenação do paginado, mas sem skip/take/total.
 */
export async function listarClientes(opts?: ListarClientesOpts) {
  return prisma.cliente.findMany({
    where: buildWhere(opts),
    orderBy: buildOrderBy(opts),
    include: { _count: { select: { contatos: true } } },
  });
}

/** Variante paginada para a listagem de Clientes: aplica skip/take e retorna o total. */
export async function listarClientesPaginado(opts?: ListarClientesOpts) {
  const where = buildWhere(opts);
  const [items, total] = await prisma.$transaction([
    prisma.cliente.findMany({
      where,
      orderBy: buildOrderBy(opts),
      include: { _count: { select: { contatos: true } } },
      skip: opts?.skip,
      take: opts?.take,
    }),
    prisma.cliente.count({ where }),
  ]);
  return { items, total };
}

/** UFs e cidades distintas (para popular os selects de filtro). */
export async function listarFiltrosClientes() {
  const rows = await prisma.cliente.findMany({
    where: { OR: [{ uf: { not: null } }, { cidade: { not: null } }] },
    select: { uf: true, cidade: true },
    distinct: ["uf", "cidade"],
  });
  const ufs = [...new Set(rows.map((r) => r.uf).filter((v): v is string => !!v))].sort();
  const cidades = [...new Set(rows.map((r) => r.cidade).filter((v): v is string => !!v))].sort(
    (a, b) => a.localeCompare(b, "pt-BR"),
  );
  return { ufs, cidades };
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
