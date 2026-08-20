import "server-only";
import { prisma } from "@/lib/prisma";
import { nomeDisciplinaItem } from "@/modules/comercial/disciplinas";
import {
  STATUS_PROSPECCAO_ATIVOS,
  COLUNAS_PROSPECCAO,
} from "@/modules/comercial/prospeccao";
import { ESTAGIOS_ATIVOS } from "@/modules/comercial/jornada";
import type { TipoAncoraCompromisso } from "@/generated/prisma/client";

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

// ── Próxima Ação (F2.10, ADR-17) ─────────────────────────────────────────────
/**
 * Ids de entidades que TÊM próxima ação em aberto.
 *
 * Duas consultas em vez de um join porque a âncora é **polimórfica e sem FK**
 * (`entidadeTipo`/`entidadeId` apontam para Lead, Negociacao ou Cliente — o mesmo padrão de
 * `ApontamentoCoordenacao`/`Pendencia`). O Prisma não junta relação que não existe no schema, e
 * inventar três FKs nullable só para permitir o join deixaria o modelo pior que a consulta extra.
 *
 * `tipo: { not: null }` restringe a compromissos COMERCIAIS: uma reunião comum marcada com o
 * cliente não conta como próxima ação de prospecção.
 */
async function idsComAcaoAberta(entidadeTipo: TipoAncoraCompromisso): Promise<Set<string>> {
  const linhas = await prisma.compromisso.findMany({
    where: { entidadeTipo, tipo: { not: null }, concluidoEm: null },
    select: { entidadeId: true },
  });
  return new Set(linhas.map((l) => l.entidadeId).filter((id): id is string => id != null));
}

/**
 * **Prospecções ativas sem próxima ação marcada** — a pergunta que hoje é impossível de
 * responder por query, porque o lead vive como texto dentro do título do compromisso.
 *
 * É a métrica de abandono do funil: quem está aberto e sem ninguém tendo combinado o próximo
 * passo. Alimenta a lista de follow-up (F2.11) e o "Meu Dia" (F6.5).
 */
export async function prospeccoesSemProximaAcao() {
  const comAcao = await idsComAcaoAberta("LEAD");
  const ativos = await prisma.lead.findMany({
    where: { status: { in: [...STATUS_PROSPECCAO_ATIVOS] }, arquivado: false },
    orderBy: { updatedAt: "asc" },
    select: {
      id: true,
      nome: true,
      status: true,
      updatedAt: true,
      cliente: { select: { id: true, nome: true } },
      responsavel: { select: { id: true, name: true } },
    },
  });
  return ativos.filter((l) => !comAcao.has(l.id));
}

/** Mesma leitura para negociações — o funil de baixo tem o mesmo buraco. */
export async function negociacoesSemProximaAcao() {
  const comAcao = await idsComAcaoAberta("NEGOCIACAO");
  const ativas = await prisma.negociacao.findMany({
    where: { estagio: { in: [...ESTAGIOS_ATIVOS] } },
    orderBy: { updatedAt: "asc" },
    select: {
      id: true,
      titulo: true,
      estagio: true,
      updatedAt: true,
      cliente: { select: { id: true, nome: true } },
      responsavel: { select: { id: true, name: true } },
    },
  });
  return ativas.filter((n) => !comAcao.has(n.id));
}

/** Próximas ações em aberto de uma entidade, da mais próxima para a mais distante. */
export async function proximasAcoesDe(entidadeTipo: TipoAncoraCompromisso, entidadeId: string) {
  return prisma.compromisso.findMany({
    where: { entidadeTipo, entidadeId, tipo: { not: null }, concluidoEm: null },
    orderBy: { inicio: "asc" },
    select: {
      id: true,
      titulo: true,
      tipo: true,
      inicio: true,
      fim: true,
      local: true,
      criador: { select: { name: true } },
    },
  });
}

// ── Kanban de Prospecção (F2.13) ─────────────────────────────
/**
 * Board de prospecção agrupado por `status` (o funil novo), não por `FunilEtapa` (deprecado).
 *
 * **Uma query só** para montar o board inteiro, com os contatos e a próxima ação resolvidos em
 * lote — o N+1 clássico aqui seria buscar a próxima ação por card, e numa coluna de 200 isso são
 * 200 idas ao banco só para desenhar uma etiqueta.
 */
export async function funilProspeccao() {
  const leads = await prisma.lead.findMany({
    where: { status: { in: [...COLUNAS_PROSPECCAO] }, arquivado: false },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      nome: true,
      status: true,
      temperatura: true,
      valorEstimado: true,
      updatedAt: true,
      origemDetalhada: true,
      cliente: { select: { id: true, nome: true } },
      responsavel: { select: { id: true, name: true } },
      parceiro: { select: { id: true, nome: true } },
      _count: { select: { propostas: true } },
    },
  });

  // Próximas ações de TODOS os leads numa consulta só (âncora polimórfica, sem FK — ver F2.10).
  const acoes = await prisma.compromisso.findMany({
    where: {
      entidadeTipo: "LEAD",
      entidadeId: { in: leads.map((l) => l.id) },
      tipo: { not: null },
      concluidoEm: null,
    },
    orderBy: { inicio: "asc" },
    select: { entidadeId: true, inicio: true, tipo: true, titulo: true },
  });
  // Primeira ação de cada lead (a lista já vem ordenada por data).
  const proximaPorLead = new Map<string, (typeof acoes)[number]>();
  for (const a of acoes) {
    if (a.entidadeId && !proximaPorLead.has(a.entidadeId)) proximaPorLead.set(a.entidadeId, a);
  }

  const comAcao = leads.map((l) => {
    const prox = proximaPorLead.get(l.id);
    return {
      ...l,
      valorEstimado: l.valorEstimado != null ? Number(l.valorEstimado) : null,
      updatedAt: l.updatedAt.toISOString(),
      proximaAcao: prox
        ? { inicio: prox.inicio.toISOString(), tipo: prox.tipo, titulo: prox.titulo }
        : null,
    };
  });

  return COLUNAS_PROSPECCAO.map((status) => ({
    status,
    leads: comAcao.filter((l) => l.status === status),
  }));
}
export type ColunaProspeccao = Awaited<ReturnType<typeof funilProspeccao>>[number];
export type LeadProspeccao = ColunaProspeccao["leads"][number];
