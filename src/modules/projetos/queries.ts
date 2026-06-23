import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { INTERNAL_ROLES, acessoGlobal, type Role } from "@/lib/roles";
import { CATEGORIA_TERCEIRIZADO } from "@/modules/financeiro/custo/lancamento-custo";
import { calcularRateioDetalhado } from "@/modules/rh/rateio/queries";

type Viewer = { id: string; role: Role; ehSocio?: boolean };

/** Filtro de escopo: global (inclui sócio) vê tudo; cliente vê seus projetos; demais só onde participam. */
export function escopoProjeto(viewer: Viewer): Prisma.ProjetoWhereInput {
  if (acessoGlobal(viewer)) return {};
  // P-60: role "cliente" vê projetos vinculados ao seu Cliente (via User.clienteId).
  if (viewer.role === "cliente") {
    return { cliente: { usuarios: { some: { id: viewer.id } } } };
  }
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
    membroId?: string;
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
  if (opts?.membroId) {
    and.push({
      OR: [
        { membros: { some: { userId: opts.membroId } } },
        { disciplinas: { some: { responsaveis: { some: { userId: opts.membroId } } } } },
      ],
    });
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
        disciplinas: { select: { status: true, prazo: true } },
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
              aceite: { select: { token: true, situacao: true } },
            },
          },
          _count: { select: { pagamentos: true } },
        },
      },
    },
  });
  if (!projeto) return null;

  // Oculta valores de disciplinas das quais o usuário não é responsável (não-global).
  if (!acessoGlobal(viewer)) {
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

/** P-17/N-38: Disciplinas aguardando validação além do SLA (padrão 5 dias úteis ≈ 7 dias). */
export const SLA_VALIDACAO_DIAS = 7;

export async function disciplinasForaDeSLA(viewer: Viewer) {
  const limite = new Date();
  limite.setDate(limite.getDate() - SLA_VALIDACAO_DIAS);
  return prisma.disciplina.findMany({
    where: {
      status: "entregue",
      entregueEm: { lte: limite, not: null },
      pagamentos: { none: {} },
      projeto: { AND: [escopoProjeto(viewer)] },
    },
    select: {
      id: true,
      nome: true,
      entregueEm: true,
      projetoId: true,
      projeto: { select: { id: true, codigo: true, nome: true } },
    },
    orderBy: { entregueEm: "asc" },
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
      select: {
        tipo: true,
        status: true,
        valor: true,
        valorEfetivo: true,
        pagamentoProjetistaId: true,
        categoria: { select: { codigo: true } },
      },
    }),
    prisma.rateioHora.aggregate({ where: { projetoId }, _sum: { custo: true } }),
  ]);

  let receitaConfirmada = 0;
  let receitaPrevista = 0;
  let despesaConfirmada = 0;
  let despesaPrevista = 0;
  // Composição do custo direto por origem (confirmado + previsto).
  const custo = {
    projetistasConfirmado: 0,
    projetistasPrevisto: 0,
    servicosConfirmado: 0,
    servicosPrevisto: 0,
    outrasConfirmado: 0,
    outrasPrevisto: 0,
  };

  for (const l of lancs) {
    const realizado = Number(l.valorEfetivo ?? l.valor);
    const previsto = Number(l.valor);
    if (l.tipo === "receita") {
      if (l.status === "confirmado") receitaConfirmada += realizado;
      else receitaPrevista += previsto;
      continue;
    }
    // Despesa: classifica por origem.
    const origem = l.pagamentoProjetistaId
      ? "projetistas"
      : l.categoria?.codigo === CATEGORIA_TERCEIRIZADO
        ? "servicos"
        : "outras";
    if (l.status === "confirmado") {
      despesaConfirmada += realizado;
      custo[`${origem}Confirmado` as const] += realizado;
    } else {
      despesaPrevista += previsto;
      custo[`${origem}Previsto` as const] += previsto;
    }
  }

  const custoHoras = Number(rateio._sum.custo ?? 0);

  // P-26: estimativa do custo de horas do mês corrente (ainda não fechado).
  // Só conta se o mês ainda não tem RateioHora (senão já está em `custoHoras`).
  const agora = new Date();
  const anoAtual = agora.getFullYear();
  const mesAtual = agora.getMonth() + 1;
  const mesFechado = await prisma.rateioHora.findFirst({
    where: { projetoId, ano: anoAtual, mes: mesAtual },
    select: { id: true },
  });
  let custoHorasMesCorrente = 0;
  if (!mesFechado) {
    const rows = await calcularRateioDetalhado(anoAtual, mesAtual);
    custoHorasMesCorrente = rows
      .filter((r) => r.projetoId === projetoId)
      .reduce((s, r) => s + r.custo, 0);
    custoHorasMesCorrente = Math.round(custoHorasMesCorrente * 100) / 100;
  }

  const margem = receitaConfirmada - despesaConfirmada - custoHoras;
  const margemPct = receitaConfirmada > 0 ? (margem / receitaConfirmada) * 100 : null;
  // Resultado projetado: considera receita/despesa previstas + horas do mês corrente.
  const margemProjetada =
    receitaConfirmada + receitaPrevista - despesaConfirmada - despesaPrevista - custoHoras - custoHorasMesCorrente;

  return {
    receitaConfirmada,
    receitaPrevista,
    despesaDireta: despesaConfirmada,
    despesaDiretaPrevista: despesaPrevista,
    custoHoras,
    custoHorasMesCorrente,
    custo,
    margem,
    margemPct,
    margemProjetada,
  };
}

/** Dados mínimos do projeto para o layout (cabeçalho + tabs) — evita repetir obterProjeto completo. */
export async function obterProjetoMinimo(viewer: Viewer, id: string) {
  return prisma.projeto.findFirst({
    where: { id, AND: [escopoProjeto(viewer)] },
    select: {
      id: true,
      codigo: true,
      nome: true,
      situacao: true,
      tipo: true,
      prazoFinal: true,
      cliente: { select: { id: true, nome: true } },
    },
  });
}

/** N-07: eventos de mudança de status das disciplinas de um projeto, via AuditLog. */
export async function timelineStatusProjeto(projetoId: string) {
  const discIds = await prisma.disciplina.findMany({
    where: { projetoId },
    select: { id: true, nome: true },
  });
  if (discIds.length === 0) return [];
  const idMap = new Map(discIds.map((d) => [d.id, d.nome]));
  const logs = await prisma.auditLog.findMany({
    where: {
      modulo: "projetos",
      acao: { in: ["atualizar-status-disciplina", "validar-entrega"] },
      entidade: "Disciplina",
      entidadeId: { in: [...idMap.keys()] },
      resultado: "sucesso",
    },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      id: true,
      acao: true,
      entidadeId: true,
      detalhe: true,
      createdAt: true,
      user: { select: { name: true } },
    },
  });
  return logs.map((l) => {
    const det = l.detalhe as Record<string, unknown> | null;
    const detNovo = det?.novo as Record<string, unknown> | undefined;
    const status = (det?.status ?? detNovo?.status ?? null) as string | null;
    return {
      id: l.id,
      disciplinaNome: l.entidadeId ? (idMap.get(l.entidadeId) ?? "Disciplina") : "Disciplina",
      acao: l.acao,
      status,
      userName: l.user?.name ?? "Sistema",
      createdAt: l.createdAt.toISOString(),
    };
  });
}

export type ProjetoListItem = Awaited<ReturnType<typeof listarProjetos>>["items"][number];
export type ProjetoDetalhe = NonNullable<Awaited<ReturnType<typeof obterProjeto>>>;
export type DisciplinaDetalhe = ProjetoDetalhe["disciplinas"][number];
