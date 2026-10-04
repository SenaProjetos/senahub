import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { StatusComercialCliente } from "@/generated/prisma/enums";
import type { Dir } from "@/lib/list-params";
import { motivoParaNaoExcluir, type VinculosCliente } from "@/modules/clientes/exclusao";

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
  categoria?: string;
  /** "ativo" | "inativo" — filtra `ativo`. Quando ausente, segue `incluirInativos`. */
  situacao?: "ativo" | "inativo";
  /** Segmento de mercado (F1.11, catálogo `Segmento`). */
  segmentoId?: string;
  /** Status comercial — "classificação" no vocabulário do playbook (ADR-08). */
  status?: StatusComercialCliente;
  /** F4.1 — "lista SN": candidatos curados do Sales Navigator, dentro/fora do funil. */
  listaSalesNavigator?: boolean;
  sort?: string | null;
  dir?: Dir;
  skip?: number;
  take?: number;
};

/** Valor do filtro "Situação" na URL da lista de Clientes. Sem parâmetro = só ativos. */
export type SituacaoFiltroCliente = "ativo" | "inativo" | "todas";

/**
 * Regra ÚNICA do filtro de situação — a tela (`/clientes`) e o export CSV leem a URL por aqui, para
 * o arquivo nunca trazer linhas que a tela não mostra. Sem `situacao` na URL a lista esconde os
 * inativos; "todas" volta a mostrar os dois.
 */
export function filtroSituacaoDaUrl(v: string | null | undefined): {
  valor: SituacaoFiltroCliente;
  opts: Pick<ListarClientesOpts, "situacao" | "incluirInativos">;
} {
  if (v === "inativo") return { valor: "inativo", opts: { situacao: "inativo" } };
  if (v === "todas") return { valor: "todas", opts: { incluirInativos: true } };
  return { valor: "ativo", opts: { situacao: "ativo" } };
}

function buildWhere(opts?: ListarClientesOpts): Prisma.ClienteWhereInput {
  const where: Prisma.ClienteWhereInput = {};

  if (opts?.situacao === "ativo") where.ativo = true;
  else if (opts?.situacao === "inativo") where.ativo = false;
  else if (!opts?.incluirInativos) where.ativo = true;

  if (opts?.tipo) where.tipo = opts.tipo;
  if (opts?.uf) where.uf = opts.uf;
  if (opts?.cidade) where.cidade = { equals: opts.cidade, mode: "insensitive" };
  if (opts?.categoria) where.categoria = opts.categoria;
  if (opts?.segmentoId) where.segmentoId = opts.segmentoId;
  if (opts?.status) where.status = opts.status;
  if (opts?.listaSalesNavigator) where.listaSalesNavigator = true;

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
    // `_count` tambem e leitura aninhada: sem o where, contaria contato excluido e o numero
    // na lista nao bateria com a ficha do cliente (F1.18).
    include: { _count: { select: { contatos: { where: { excluidoEm: null } } } } },
  });
}

/** Variante paginada para a listagem de Clientes: aplica skip/take e retorna o total. */
export async function listarClientesPaginado(opts?: ListarClientesOpts) {
  const where = buildWhere(opts);
  const [items, total] = await prisma.$transaction([
    prisma.cliente.findMany({
      where,
      orderBy: buildOrderBy(opts),
      include: { _count: { select: { contatos: { where: { excluidoEm: null } } } } },
      skip: opts?.skip,
      take: opts?.take,
    }),
    prisma.cliente.count({ where }),
  ]);
  return { items, total };
}

/**
 * Clientes por id — a visão "Selecionados (N)" da lista, que junta empresas marcadas em filtros e
 * páginas diferentes. Mesma forma da listagem (`ClienteListItem`), sem filtro nenhum: o id é o filtro.
 */
export async function listarClientesPorIds(ids: readonly string[]) {
  if (ids.length === 0) return [];
  return prisma.cliente.findMany({
    where: { id: { in: [...ids] } },
    orderBy: { nome: "asc" },
    include: { _count: { select: { contatos: { where: { excluidoEm: null } } } } },
  });
}

/**
 * Vínculos de cada cliente — base da regra de exclusão (`exclusao.ts`). Contagem ANINHADA não passa
 * pela extensão de soft delete, então quem tem `excluidoEm` filtra explícito: contato, lançamento,
 * prospecção ou negociação excluídos não impedem. `DocumentoFinanceiro.clienteId` não tem relação
 * no schema, por isso vem num `groupBy` à parte. Cliente já excluído não volta no mapa.
 */
export async function vinculosDosClientes(ids: readonly string[]): Promise<Map<string, VinculosCliente>> {
  if (ids.length === 0) return new Map();
  const [rows, docsFin] = await Promise.all([
    prisma.cliente.findMany({
      where: { id: { in: [...ids] } },
      select: {
        id: true,
        usuarioId: true,
        fundidoEmId: true,
        _count: {
          select: {
            contatos: { where: { excluidoEm: null } },
            projetos: true,
            lancamentos: { where: { excluidoEm: null } },
            leads: { where: { excluidoEm: null } },
            negociacoes: { where: { excluidoEm: null } },
            propostas: true,
            documentos: true,
            docsJuridicos: true,
            orcamentosCusto: true,
            usuarios: true,
            regrasPreenchimento: true,
            absorvidos: true,
            atividadesComerciais: { where: { tipo: { not: "SISTEMA" } } },
          },
        },
      },
    }),
    prisma.documentoFinanceiro.groupBy({
      by: ["clienteId"],
      where: { clienteId: { in: [...ids] } },
      _count: { _all: true },
    }),
  ]);
  const finPorCliente = new Map(docsFin.map((d) => [d.clienteId, d._count._all]));
  return new Map(
    rows.map((r) => [
      r.id,
      {
        contatos: r._count.contatos,
        projetos: r._count.projetos,
        lancamentos: r._count.lancamentos,
        documentosFinanceiros: finPorCliente.get(r.id) ?? 0,
        prospeccoes: r._count.leads,
        negociacoes: r._count.negociacoes,
        propostas: r._count.propostas,
        documentos: r._count.documentos,
        documentosJuridicos: r._count.docsJuridicos,
        orcamentosCusto: r._count.orcamentosCusto,
        // `usuarioId` é o login antigo do portal; `usuarios` é o vínculo atual (role cliente).
        usuariosPortal: r._count.usuarios + (r.usuarioId ? 1 : 0),
        regrasPreenchimento: r._count.regrasPreenchimento,
        interacoes: r._count.atividadesComerciais,
        fusao: !!r.fundidoEmId || r._count.absorvidos > 0,
      },
    ]),
  );
}

/** Linhas da lista com o motivo de não poder excluir (`null` = pode) — alimenta o menu. */
export async function comBloqueioExclusao<T extends { id: string }>(
  items: T[],
): Promise<(T & { bloqueioExclusao: string | null })[]> {
  const vinculos = await vinculosDosClientes(items.map((c) => c.id));
  return items.map((c) => {
    const v = vinculos.get(c.id);
    return { ...c, bloqueioExclusao: v ? motivoParaNaoExcluir(v) : "Cliente não encontrado ou já excluído." };
  });
}

/** UFs, cidades e categorias distintas (para popular os selects de filtro). */
export async function listarFiltrosClientes() {
  const [rows, segmentos] = await Promise.all([
    prisma.cliente.findMany({
      where: {
        OR: [{ uf: { not: null } }, { cidade: { not: null } }, { categoria: { not: null } }],
      },
      select: { uf: true, cidade: true, categoria: true },
      distinct: ["uf", "cidade", "categoria"],
    }),
    // Segmento é catálogo (F1.6), não texto livre — lista as opções configuradas, não um
    // `distinct` sobre o que já foi usado (que ficaria vazio até o primeiro cliente ganhar um).
    prisma.segmento.findMany({
      where: { ativo: true },
      orderBy: { ordem: "asc" },
      select: { id: true, nome: true },
    }),
  ]);
  const ufs = [...new Set(rows.map((r) => r.uf).filter((v): v is string => !!v))].sort();
  const cidades = [...new Set(rows.map((r) => r.cidade).filter((v): v is string => !!v))].sort(
    (a, b) => a.localeCompare(b, "pt-BR"),
  );
  const categorias = [
    ...new Set(rows.map((r) => r.categoria).filter((v): v is string => !!v)),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  return { ufs, cidades, categorias, segmentos };
}

/**
 * Resumo de todos os clientes para checagem de duplicata (F1.13) — poucos campos, sem paginar:
 * o volume (46 em produção hoje) não justifica a complexidade de paginar uma busca de dedupe.
 */
export async function clientesParaDedupe() {
  return prisma.cliente.findMany({
    select: { id: true, nome: true, tipo: true, documento: true, email: true },
  });
}

/** Contatos de um cliente, para hidratar a aba "Contatos" do formulário sob demanda. */
export async function contatosDoCliente(clienteId: string) {
  return prisma.contatoCliente.findMany({
    where: { clienteId },
    orderBy: [{ principal: "desc" }, { nome: "asc" }],
  });
}

export async function obterCliente(id: string) {
  return prisma.cliente.findUnique({
    where: { id },
    include: {
      // `excluidoEm: null` EXPLÍCITO: leitura ANINHADA não passa pela extensão de soft delete
      // (F1.18) — sem isto, contato excluído continuaria na ficha do cliente.
      contatos: { where: { excluidoEm: null }, orderBy: [{ principal: "desc" }, { nome: "asc" }] },
    },
  });
}

/** Resumo financeiro do cliente: receitas vinculadas (total / pago / em aberto). */
export async function resumoFinanceiroCliente(clienteId: string) {
  const lancamentos = await prisma.lancamento.findMany({
    // Sem a previsão do cronograma (F7.2): "em aberto" é o que foi cobrado e não pago.
    where: { clienteId, tipo: "receita", status: { notIn: ["cancelado", "previsao"] } },
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

/** Evento da timeline de histórico do cliente (apenas dados já existentes). */
export type EventoHistorico = {
  id: string;
  data: Date;
  tipo: "cadastro" | "projeto" | "proposta" | "lancamento";
  descricao: string;
};

/**
 * Histórico do cliente: agrega, em ordem cronológica decrescente, eventos já
 * disponíveis no banco — cadastro do cliente, criação de projetos, propostas e
 * lançamentos financeiros. Não cria nenhum model de "interação".
 */
export async function historicoCliente(clienteId: string): Promise<EventoHistorico[]> {
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: {
      createdAt: true,
      nome: true,
      projetos: {
        select: { id: true, codigo: true, nome: true, createdAt: true },
      },
      propostas: {
        select: { id: true, numero: true, titulo: true, createdAt: true },
      },
      lancamentos: {
        where: { status: { not: "cancelado" } },
        select: { id: true, descricao: true, tipo: true, data: true },
      },
    },
  });
  if (!cliente) return [];

  const eventos: EventoHistorico[] = [
    {
      id: `cadastro-${clienteId}`,
      data: cliente.createdAt,
      tipo: "cadastro",
      descricao: "Cliente cadastrado.",
    },
    ...cliente.projetos.map((p) => ({
      id: `projeto-${p.id}`,
      data: p.createdAt,
      tipo: "projeto" as const,
      descricao: `Projeto criado: ${p.codigo} — ${p.nome}`,
    })),
    ...cliente.propostas.map((p) => ({
      id: `proposta-${p.id}`,
      data: p.createdAt,
      tipo: "proposta" as const,
      descricao: `Proposta ${p.numero}: ${p.titulo}`,
    })),
    ...cliente.lancamentos.map((l) => ({
      id: `lancamento-${l.id}`,
      data: l.data,
      tipo: "lancamento" as const,
      descricao: `${l.tipo === "receita" ? "Receita" : "Despesa"}: ${l.descricao}`,
    })),
  ];

  return eventos.sort((a, b) => b.data.getTime() - a.data.getTime());
}

export type ClienteListItem = Awaited<ReturnType<typeof listarClientes>>[number];
/** Linha da tela de Clientes: o item da lista + o motivo de não poder excluir. */
export type ClienteLinha = ClienteListItem & { bloqueioExclusao: string | null };
export type ClienteDetalhe = NonNullable<Awaited<ReturnType<typeof obterCliente>>>;
export type ContatoItem = ClienteDetalhe["contatos"][number];
