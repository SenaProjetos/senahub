import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { GLOBAL_ROLES, INTERNAL_ROLES, type Role } from "@/lib/roles";

type Viewer = { id: string; role: Role };

function isGlobal(role: Role) {
  return role === "admin" || GLOBAL_ROLES.includes(role);
}

/** Filtro de escopo: global vê tudo; demais veem só onde participam. */
export function escopoProjeto(viewer: Viewer): Prisma.ProjetoWhereInput {
  if (isGlobal(viewer.role)) return {};
  return {
    OR: [
      { membros: { some: { userId: viewer.id } } },
      { disciplinas: { some: { responsaveis: { some: { userId: viewer.id } } } } },
    ],
  };
}

type Dir = "asc" | "desc";

function orderByProjeto(sort: string | undefined, dir: Dir): Prisma.ProjetoOrderByWithRelationInput[] {
  switch (sort) {
    case "codigo":
      return [{ ano: dir }, { sequencial: dir }];
    case "nome":
      return [{ nome: dir }];
    case "situacao":
      return [{ situacao: dir }];
    case "cliente":
      return [{ cliente: { nome: dir } }];
    default:
      return [{ ano: "desc" }, { sequencial: "desc" }];
  }
}

export async function listarProjetos(
  viewer: Viewer,
  opts?: {
    q?: string;
    situacao?: string;
    clienteId?: string;
    responsavelId?: string;
    disciplina?: string;
    sort?: string;
    dir?: Dir;
    skip?: number;
    take?: number;
  },
) {
  const where: Prisma.ProjetoWhereInput = { AND: [escopoProjeto(viewer)] };
  const and = where.AND as Prisma.ProjetoWhereInput[];
  if (opts?.situacao) and.push({ situacao: opts.situacao as never });
  if (opts?.clienteId) and.push({ clienteId: opts.clienteId });
  if (opts?.responsavelId) {
    and.push({ disciplinas: { some: { responsaveis: { some: { userId: opts.responsavelId } } } } });
  }
  if (opts?.disciplina) {
    and.push({ disciplinas: { some: { nome: opts.disciplina } } });
  }
  if (opts?.q) {
    const digits = opts.q.replace(/\D/g, "");
    and.push({
      OR: [
        { nome: { contains: opts.q, mode: "insensitive" } },
        ...(digits ? [{ codigo: { contains: digits } }] : []),
        { cliente: { nome: { contains: opts.q, mode: "insensitive" } } },
      ],
    });
  }

  const orderBy = orderByProjeto(opts?.sort, opts?.dir ?? "desc");

  const [items, total] = await prisma.$transaction([
    prisma.projeto.findMany({
      where,
      orderBy,
      skip: opts?.skip,
      take: opts?.take,
      include: {
        cliente: { select: { id: true, nome: true } },
        _count: { select: { disciplinas: true } },
        disciplinas: { select: { status: true } },
      },
    }),
    prisma.projeto.count({ where }),
  ]);

  return { items, total };
}

export async function obterProjeto(viewer: Viewer, id: string) {
  const projeto = await prisma.projeto.findFirst({
    where: { id, AND: [escopoProjeto(viewer)] },
    include: {
      cliente: true,
      membros: { include: { user: { select: { id: true, name: true, role: true } } } },
      disciplinas: {
        orderBy: { ordem: "asc" },
        include: {
          responsaveis: { include: { user: { select: { id: true, name: true, role: true } } } },
          revisoes: { orderBy: { numero: "desc" }, include: { autor: { select: { name: true } } } },
          uploads: {
            orderBy: [{ pacote: "asc" }, { createdAt: "desc" }],
            select: {
              id: true,
              pacote: true,
              nomeArquivo: true,
              versao: true,
              tamanho: true,
              validado: true,
              createdAt: true,
              autor: { select: { name: true } },
            },
          },
          _count: { select: { pagamentos: true } },
        },
      },
    },
  });
  if (!projeto) return null;

  // Oculta valores de disciplinas das quais o usuário não é responsável (não-global).
  if (!isGlobal(viewer.role)) {
    projeto.disciplinas = projeto.disciplinas.map((d) => {
      const ehResp = d.responsaveis.some((r) => r.userId === viewer.id);
      return ehResp ? d : { ...d, valor: null };
    });
  }
  return projeto;
}

/** Projetos de um cliente (sem escopo — usado em telas de gestor). */
export async function projetosDoCliente(clienteId: string) {
  return prisma.projeto.findMany({
    where: { clienteId },
    orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
    select: { id: true, codigo: true, nome: true, situacao: true, _count: { select: { disciplinas: true } } },
  });
}

export async function catalogoDisciplinas() {
  return prisma.disciplinaCatalogo.findMany({
    where: { ativo: true },
    orderBy: { ordem: "asc" },
  });
}

/** Usuários elegíveis como membros/responsáveis de projeto (todos exceto cliente). */
export async function usuariosInternos() {
  return prisma.user.findMany({
    where: { ativo: true, role: { in: INTERNAL_ROLES } },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Margem econômica do projeto (vida inteira):
 * receitas confirmadas − despesas diretas confirmadas − custo de horas rateado.
 * Custo de horas vem do snapshot fechado (`RateioHora`); valores previstos retornam à parte.
 */
export async function margemProjeto(projetoId: string) {
  const [lancs, rateio] = await Promise.all([
    prisma.lancamento.findMany({
      where: { projetoId, status: { not: "cancelado" } },
      select: { tipo: true, status: true, valor: true, valorEfetivo: true },
    }),
    prisma.rateioHora.aggregate({ where: { projetoId }, _sum: { custo: true } }),
  ]);

  let receitaConfirmada = 0;
  let receitaPrevista = 0;
  let despesaConfirmada = 0;
  let despesaPrevista = 0;
  for (const l of lancs) {
    const realizado = Number(l.valorEfetivo ?? l.valor);
    const previsto = Number(l.valor);
    if (l.tipo === "receita") {
      if (l.status === "confirmado") receitaConfirmada += realizado;
      else receitaPrevista += previsto;
    } else {
      if (l.status === "confirmado") despesaConfirmada += realizado;
      else despesaPrevista += previsto;
    }
  }

  const custoHoras = Number(rateio._sum.custo ?? 0);
  const margem = receitaConfirmada - despesaConfirmada - custoHoras;
  const margemPct = receitaConfirmada > 0 ? (margem / receitaConfirmada) * 100 : null;

  return {
    receitaConfirmada,
    receitaPrevista,
    despesaDireta: despesaConfirmada,
    despesaDiretaPrevista: despesaPrevista,
    custoHoras,
    margem,
    margemPct,
  };
}

export type ProjetoListItem = Awaited<ReturnType<typeof listarProjetos>>["items"][number];
export type ProjetoDetalhe = NonNullable<Awaited<ReturnType<typeof obterProjeto>>>;
export type DisciplinaDetalhe = ProjetoDetalhe["disciplinas"][number];
