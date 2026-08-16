import "server-only";
import { prisma } from "@/lib/prisma";
import { nomeDisciplinaItem } from "@/modules/comercial/disciplinas";

// ── Funil ─────────────────────────────────────────────────────
export async function funilCompleto() {
  const etapas = await prisma.funilEtapa.findMany({
    where: { ativo: true },
    orderBy: { ordem: "asc" },
    include: {
      leads: {
        // `excluidoEm: null` EXPLÍCITO: esta é leitura ANINHADA (leads via FunilEtapa) e não
        // passa pela extensão de soft delete do `lib/prisma.ts` — sem isto, lead excluído
        // continuaria aparecendo no Kanban (F1.18).
        where: { arquivado: false, excluidoEm: null },
        orderBy: { updatedAt: "desc" },
        include: {
          cliente: { select: { id: true, nome: true } },
          // Parceiro (F1.23a): so o suficiente pra exibir; a lista de opcoes do Select vem de
          // `parceirosAtivos()`, nao daqui.
          parceiro: { select: { id: true, nome: true } },
          atividades: {
            orderBy: { createdAt: "desc" },
            include: { autor: { select: { name: true } } },
          },
          anexos: {
            orderBy: { createdAt: "desc" },
            select: { id: true, nome: true, nomeArquivo: true, tamanho: true, createdAt: true },
          },
          _count: { select: { propostas: true } },
        },
      },
    },
  });
  // Serializa Decimal → number (Client Components não aceitam Decimal).
  return etapas.map((e) => ({
    ...e,
    leads: e.leads.map((l) => ({ ...l, valorEstimado: l.valorEstimado != null ? Number(l.valorEstimado) : null })),
  }));
}

export async function obterLead(id: string) {
  return prisma.lead.findUnique({
    where: { id },
    include: {
      etapa: true,
      cliente: { select: { id: true, nome: true } },
      parceiro: { select: { id: true, nome: true } },
      atividades: { orderBy: { createdAt: "desc" }, include: { autor: { select: { name: true } } } },
      anexos: {
        orderBy: { createdAt: "desc" },
        select: { id: true, nome: true, nomeArquivo: true, tamanho: true, createdAt: true },
      },
      propostas: { select: { id: true, numero: true, titulo: true, status: true } },
    },
  });
}

// ── Dashboard / metas ─────────────────────────────────────────
export async function resumoComercial() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = agora.getMonth() + 1;
  const ini = new Date(ano, mes - 1, 1);
  const fim = new Date(ano, mes, 0, 23, 59, 59);

  const [meta, aceitas, enviadas, leadsAtivos] = await Promise.all([
    prisma.metaComercial.findUnique({ where: { ano_mes: { ano, mes } } }),
    prisma.proposta.findMany({
      where: { status: "aceita", aceitaEm: { gte: ini, lte: fim } },
      include: { itens: { select: { valor: true } } },
    }),
    prisma.proposta.count({ where: { status: "enviada" } }),
    prisma.lead.count({ where: { arquivado: false } }),
  ]);

  const realizado = aceitas.reduce(
    (s, p) => s + p.itens.reduce((x, i) => x + Number(i.valor), 0),
    0,
  );
  return {
    ano,
    mes,
    meta: meta ? Number(meta.valor) : 0,
    realizado,
    aceitasNoMes: aceitas.length,
    enviadas,
    leadsAtivos,
  };
}

// ── Propostas ─────────────────────────────────────────────────
const INCLUDE_PROPOSTA = {
  cliente: { select: { id: true, nome: true } },
  // `disciplina` (catalogo) junto: quem exibe usa `nomeDisciplinaItem`, que prefere o
  // catalogo e cai no texto original (F1.19).
  itens: {
    orderBy: { ordem: "asc" as const },
    include: { disciplina: { select: { nome: true } } },
  },
  condicoes: { orderBy: { ordem: "asc" as const } },
  _count: { select: { visualizacoes: true, versoes: true } },
};

export async function listarPropostas(status?: string) {
  return prisma.proposta.findMany({
    where: status ? { status: status as never } : {},
    orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
    include: INCLUDE_PROPOSTA,
  });
}

export async function obterProposta(id: string) {
  return prisma.proposta.findUnique({
    where: { id },
    include: {
      ...INCLUDE_PROPOSTA,
      lead: { select: { id: true, nome: true } },
      visualizacoes: { orderBy: { createdAt: "desc" }, take: 10 },
      versoes: { orderBy: { numero: "desc" }, take: 10, include: { autor: { select: { name: true } } } },
    },
  });
}

/**
 * Tabelas de preço já resolvidas para exibição: nome de disciplina vindo do catálogo (com queda
 * para o texto original) e `valorM2` como number.
 *
 * A resolução mora AQUI, e não em cada página, por causa de uma divergência que a F1.19+F1.20
 * criaram: o item da proposta passou a ser exibido pelo nome do CATÁLOGO enquanto a linha da
 * tabela continuava vindo como texto legado. Como o editor casa os dois LADOS por texto, uma
 * disciplina renomeada no catálogo (o caso real "Lógica" → "Cabeamento") deixava de casar — em
 * silêncio, sem erro, só um item a menos precificado. Com as duas pontas passando por
 * `nomeDisciplinaItem`, elas voltam a concordar.
 *
 * A ordenação é por nome RESOLVIDO, feita aqui em JS: ordenar no banco por
 * `disciplinaTextoLegado` classificaria por uma string que ninguém mais vê na tela.
 */
export async function listarTabelasPreco() {
  const tabelas = await prisma.tabelaPreco.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    include: { itens: { include: { disciplina: { select: { nome: true } } } } },
  });
  return tabelas.map((t) => ({
    id: t.id,
    nome: t.nome,
    itens: t.itens
      .map((it) => ({ disciplina: nomeDisciplinaItem(it), valorM2: Number(it.valorM2) }))
      .sort((a, b) => a.disciplina.localeCompare(b.disciplina, "pt-BR")),
  }));
}

export function totalProposta(itens: { valor: unknown }[]): number {
  return itens.reduce((s, i) => s + Number(i.valor), 0);
}

/** Todas as etapas (ativas e inativas), para tela de configuração. */
export async function listarEtapasFunil() {
  return prisma.funilEtapa.findMany({
    orderBy: { ordem: "asc" },
    // Conta so leads vivos: a tela de configuracao usa este numero para avisar quantos leads
    // uma etapa tem antes de desativa-la (F1.18).
    select: { id: true, nome: true, ordem: true, cor: true, ativo: true, _count: { select: { leads: { where: { excluidoEm: null } } } } },
  });
}
export type EtapaFunilConfig = Awaited<ReturnType<typeof listarEtapasFunil>>[number];

export type EtapaFunil = Awaited<ReturnType<typeof funilCompleto>>[number];
export type LeadItem = EtapaFunil["leads"][number];
export type LeadDetalhe = NonNullable<Awaited<ReturnType<typeof obterLead>>>;
export type PropostaListItem = Awaited<ReturnType<typeof listarPropostas>>[number];
export type PropostaDetalhe = NonNullable<Awaited<ReturnType<typeof obterProposta>>>;
export type TabelaPrecoItem = Awaited<ReturnType<typeof listarTabelasPreco>>[number];

// ── Parceiros (F1.23a/b, ADR-19) ─────────────────────────────────
/** Todos, ativos e inativos — para a tela de gestão. */
export async function listarParceiros() {
  return prisma.parceiro.findMany({
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    // `_count` e leitura ANINHADA -- nao passa pela extensao de soft delete (mesmo padrao de
    // `listarEtapasFunil`, F1.18). Sem o `where` explicito, lead excluido inflaria a contagem.
    include: { _count: { select: { leads: { where: { excluidoEm: null } } } } },
  });
}
export type ParceiroItem = Awaited<ReturnType<typeof listarParceiros>>[number];

/** Só os ativos — é o que popula o Select do formulário de lead (nunca texto livre). */
export async function parceirosAtivos() {
  return prisma.parceiro.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });
}
