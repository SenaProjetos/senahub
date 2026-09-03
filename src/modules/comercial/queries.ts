import "server-only";
import { prisma } from "@/lib/prisma";
import { nomeDisciplinaItem } from "@/modules/comercial/disciplinas";
import {
  STATUS_PROSPECCAO_ATIVOS,
  COLUNAS_PROSPECCAO,
} from "@/modules/comercial/prospeccao";
import { ESTAGIOS_ATIVOS } from "@/modules/comercial/jornada";
import type { TipoAncoraCompromisso, EstagioNegociacao, StatusProspeccao } from "@/generated/prisma/client";
import {
  whereProspeccao,
  whereNegociacao,
  type FiltrosComerciais,
} from "@/modules/comercial/filtros";
import { candidatosDuplicata, relevanciaNome, tokensDeBusca } from "@/modules/comercial/dedupe";
import { versaoVigente } from "@/modules/comercial/versoes";
import {
  pipelineAberto,
  pipelinePonderado,
  valorContratado,
  ticketMedioPorContrato,
  ESTAGIOS_PIPELINE_ABERTO,
  type LinhaNegociacao,
  type Periodo as PeriodoMetrica,
} from "@/modules/comercial/metricas";
import { diasAteVencer } from "@/modules/comercial/validade";
import { getConfigComercial } from "@/modules/comercial/config/queries";
import { clientesParaDedupe } from "@/modules/clientes/queries";

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
          // Campanha (F4.2): mesmo padrao — so o suficiente pra exibir/editar; opcoes do
          // Select vem de `campanhasAtivas()`.
          campanha: { select: { id: true, nome: true } },
          atividades: {
            orderBy: { createdAt: "desc" },
            include: { autor: { select: { name: true, image: true } } },
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
      campanha: { select: { id: true, nome: true } },
      atividades: { orderBy: { createdAt: "desc" }, include: { autor: { select: { name: true, image: true } } } },
      // F3.1: timeline nova. Nome do relation (`atividadesComerciais`) mantido distinto de
      // `atividades` (a legada) — a mesclagem dos dois em ordem cronológica única acontece na
      // camada de exibição (`mesclarTimeline`, F2.11), não aqui.
      atividadesComerciais: {
        orderBy: { createdAt: "desc" },
        include: { autor: { select: { name: true, image: true } } },
      },
      anexos: {
        orderBy: { createdAt: "desc" },
        select: { id: true, nome: true, nomeArquivo: true, tamanho: true, createdAt: true },
      },
      propostas: { select: { id: true, numero: true, titulo: true, status: true } },
    },
  });
}

// ── Dashboard / metas ─────────────────────────────────────────
export async function resumoComercial(responsavelId?: string) {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = agora.getMonth() + 1;
  const ini = new Date(ano, mes - 1, 1);
  const fim = new Date(ano, mes, 0, 23, 59, 59);

  const [meta, aceitas, enviadas, leadsAtivos] = await Promise.all([
    prisma.metaComercial.findUnique({ where: { ano_mes: { ano, mes } } }),
    prisma.proposta.findMany({
      where: {
        status: "aceita",
        aceitaEm: { gte: ini, lte: fim },
        negociacao: responsavelId ? { responsavelId } : undefined,
      },
      select: { versoes: { select: { numero: true, valorVersao: true } } },
    }),
    prisma.proposta.count({
      where: { status: "enviada", negociacao: responsavelId ? { responsavelId } : undefined },
    }),
    prisma.lead.count({ where: { arquivado: false, responsavelId } }),
  ]);

  // `valorVersao` da versão VIGENTE (a de maior número), não a soma crua dos itens — mesmo bug
  // que a F6.1a corrigiu em `aceitarProposta`: somar `itens.valor` ignora `PropostaVersao.desconto`
  // e infla a meta batida sempre que alguém aceitou com desconto (achado revisando esta query
  // enquanto a F6.5 trocava o "realizado" do card por `valorContratado`, que já é líquido).
  const realizado = aceitas.reduce((s, p) => {
    const vigente = versaoVigente(p.versoes);
    return s + (vigente ? Number(vigente.valorVersao) : 0);
  }, 0);
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
      versoes: { orderBy: { numero: "desc" }, take: 10, include: { autor: { select: { name: true, image: true } } } },
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

// ── Campanhas (F4.2) ──────────────────────────────────────────────
/** Todas, ativas e inativas — para a tela de gestão. */
export async function listarCampanhas() {
  return prisma.campanha.findMany({
    orderBy: [{ ativo: "desc" }, { createdAt: "desc" }],
    include: {
      canal: { select: { nome: true } },
      responsavel: { select: { name: true } },
      // Aninhado: sem `where`, lead/negociação excluído inflaria a contagem (mesmo ponto de
      // `listarParceiros`, F1.18).
      _count: {
        select: {
          leads: { where: { excluidoEm: null } },
          negociacoes: { where: { excluidoEm: null } },
        },
      },
    },
  });
}
export type CampanhaItem = Awaited<ReturnType<typeof listarCampanhas>>[number];

/**
 * Negociações que podem receber uma proposta NOVA (F5.3) — popula o Select de
 * `criarProposta`, escopado pelo cliente selecionado.
 *
 * Fora da lista: `CONTRATADO` (já tem a proposta aceita e o projeto — F5.9) e `PERDIDO`/
 * `CANCELADO` (negócio encerrado; reabrir é a F5.11, não criar proposta por cima). `EM_ESPERA`
 * entra — uma negociação pausada ainda pode ganhar uma proposta nova redigida enquanto espera.
 */
export async function negociacoesParaSelecao() {
  return prisma.negociacao.findMany({
    where: { estagio: { notIn: ["CONTRATADO", "PERDIDO", "CANCELADO"] } },
    orderBy: { titulo: "asc" },
    select: { id: true, titulo: true, clienteId: true, estagio: true },
  });
}

/** Só as ativas — popula o Select do formulário de lead (nunca texto livre). */
export async function campanhasAtivas() {
  return prisma.campanha.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });
}

/** Catálogo de canais de aquisição — popula o Select "canal" do formulário de campanha. */
export async function canaisAtivos() {
  return prisma.canalAquisicao.findMany({
    where: { ativo: true },
    orderBy: { ordem: "asc" },
    select: { id: true, nome: true },
  });
}

/** Usuários internos ativos — popula o Select "responsável" do formulário de campanha. */
export async function responsaveisAtivos() {
  return prisma.user.findMany({
    where: { ativo: true, role: { not: "cliente" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
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
/** Quantos cards de cada coluna os Kanbans carregam por página. */
export const PAGINA_COLUNA = 25;

/**
 * Board de prospecção agrupado por `status` (o funil novo), não por `FunilEtapa` (deprecado).
 *
 * A paginação é feita no banco, separadamente por coluna. As oito buscas de ids são um custo
 * fixo — nunca uma consulta por card — e permitem buscar detalhes/relações e próximas ações em
 * lote. Assim, aumentar o seed de 4 mil para 40 mil leads não aumenta o payload da página.
 */
export async function funilProspeccao(opts?: {
  pagina?: number;
  filtros?: FiltrosComerciais;
  agora?: Date;
}) {
  const take = PAGINA_COLUNA * Math.max(1, opts?.pagina ?? 1);
  const whereBase = {
    arquivado: false,
    ...(opts?.filtros ? whereProspeccao(opts.filtros, opts.agora ?? new Date()) : {}),
  };
  const [totais, idsPorStatus] = await Promise.all([
    prisma.lead.groupBy({
      by: ["status"],
      where: { ...whereBase, status: { in: [...COLUNAS_PROSPECCAO] } },
      _count: true,
    }),
    Promise.all(
      COLUNAS_PROSPECCAO.map((status) =>
        prisma.lead.findMany({
          where: { ...whereBase, status },
          orderBy: { updatedAt: "desc" },
          take,
          select: { id: true },
        }),
      ),
    ),
  ]);
  const ids = idsPorStatus.flatMap((lista) => lista.map((lead) => lead.id));
  const leads = await prisma.lead.findMany({
    where: { id: { in: ids } },
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

  const totalPorStatus = new Map(totais.map((total) => [total.status, total._count]));
  return COLUNAS_PROSPECCAO.map((status) => {
    const total = totalPorStatus.get(status) ?? 0;
    return {
      status,
      leads: comAcao.filter((lead) => lead.status === status),
      total,
      temMais: total > take,
    };
  });
}
export type ColunaProspeccao = Awaited<ReturnType<typeof funilProspeccao>>[number];
export type LeadProspeccao = ColunaProspeccao["leads"][number];

// ── Kanban de Negociações (F2.14) ────────────────────────────
/** Colunas do board de negociação, na ordem do funil. */
export const COLUNAS_NEGOCIACAO = [
  "LEVANTAMENTO",
  "ORCAMENTO",
  "PROPOSTA_ENVIADA",
  "NEGOCIACAO",
  "CONTRATADO",
  "PERDIDO",
  "EM_ESPERA",
  "CANCELADO",
] as const;

/**
 * Board de negociações.
 *
 * A paginação segue o mesmo desenho fixo da prospecção: oito buscas pequenas de ids, uma por
 * estágio, e todos os detalhes/relacionamentos resolvidos em lote. O número de consultas não
 * depende da quantidade de cards e o banco não envia negociações que serão descartadas em JS.
 *
 * **Contagem e soma vêm do banco, não do array paginado.** Se viessem do array, uma coluna com
 * 200 registros mostraria "25" e somaria só a primeira página — o número no topo da coluna
 * mentiria justamente onde ele mais importa.
 */
export async function funilNegociacao(opts?: {
  pagina?: number;
  filtros?: FiltrosComerciais;
  agora?: Date;
  alvoId?: string | null;
}) {
  const take = PAGINA_COLUNA * Math.max(1, opts?.pagina ?? 1);
  // MESMO `where` no groupBy e no findMany: se divergissem, o contador da coluna deixaria de
  // bater com os cards exibidos exatamente quando houvesse filtro — o pior momento possível.
  const where = opts?.filtros ? whereNegociacao(opts.filtros, opts.agora ?? new Date()) : {};

  const [totais, idsPorEstagio, alvo] = await Promise.all([
    prisma.negociacao.groupBy({
      by: ["estagio"],
      where,
      _count: true,
      _sum: { valorEstimado: true },
    }),
    Promise.all(
      COLUNAS_NEGOCIACAO.map((estagio) =>
        prisma.negociacao.findMany({
          where: { ...where, estagio },
          orderBy: { updatedAt: "desc" },
          take,
          select: { id: true },
        }),
      ),
    ),
    opts?.alvoId
      ? prisma.negociacao.findFirst({
          where: { id: opts.alvoId },
          select: { id: true, estagio: true },
        })
      : Promise.resolve(null),
  ]);
  if (alvo) {
    const indice = COLUNAS_NEGOCIACAO.indexOf(alvo.estagio);
    if (indice >= 0 && !idsPorEstagio[indice].some((item) => item.id === alvo.id)) {
      idsPorEstagio[indice].push({ id: alvo.id });
    }
  }
  const ids = idsPorEstagio.flatMap((lista) => lista.map((negociacao) => negociacao.id));
  const negociacoes = await prisma.negociacao.findMany({
    where: { id: { in: ids } },
    orderBy: { updatedAt: "desc" },
    select: {
        id: true,
        titulo: true,
        estagio: true,
        temperatura: true,
        valorEstimado: true,
        valorProposto: true,
        probabilidade: true,
        updatedAt: true,
        cliente: { select: { id: true, nome: true } },
        responsavel: { select: { id: true, name: true } },
        _count: { select: { disciplinas: true, contatos: true } },
    },
  });

  const acoes = await prisma.compromisso.findMany({
    where: {
      entidadeTipo: "NEGOCIACAO",
      entidadeId: { in: negociacoes.map((n) => n.id) },
      tipo: { not: null },
      concluidoEm: null,
    },
    orderBy: { inicio: "asc" },
    select: { entidadeId: true, inicio: true, tipo: true, titulo: true },
  });
  const proxima = new Map<string, (typeof acoes)[number]>();
  for (const a of acoes) {
    if (a.entidadeId && !proxima.has(a.entidadeId)) proxima.set(a.entidadeId, a);
  }

  // Checklist SOFT (F7.6): itens + marcado por card, sem N+1 — 2 queries no total (uma para o
  // catálogo inteiro, uma para as marcações de todas as negociações da página), não 1 por card
  // (o funil já roda em cima da carga sintética de 1.500 negociações da F6.2). Estágio sem item
  // no catálogo não entra no mapa → card fica sem `checklist` (null), não "0%".
  const [itensCatalogo, marcacoes] = await Promise.all([
    prisma.checklistItemPadrao.findMany({
      where: { ativo: true },
      orderBy: { ordem: "asc" },
      select: { id: true, texto: true, estagio: true },
    }),
    prisma.negociacaoChecklistItem.findMany({
      where: { negociacaoId: { in: negociacoes.map((n) => n.id) }, item: { ativo: true } },
      select: { negociacaoId: true, itemId: true },
    }),
  ]);
  const itensPorEstagio = new Map<EstagioNegociacao, { id: string; texto: string }[]>();
  for (const it of itensCatalogo) {
    const lista = itensPorEstagio.get(it.estagio) ?? [];
    lista.push({ id: it.id, texto: it.texto });
    itensPorEstagio.set(it.estagio, lista);
  }
  const marcadosPorNegociacao = new Map<string, Set<string>>();
  for (const m of marcacoes) {
    const s = marcadosPorNegociacao.get(m.negociacaoId) ?? new Set<string>();
    s.add(m.itemId);
    marcadosPorNegociacao.set(m.negociacaoId, s);
  }

  const cards = negociacoes.map((n) => {
    const p = proxima.get(n.id);
    const itens = itensPorEstagio.get(n.estagio) ?? [];
    const marcadosSet = marcadosPorNegociacao.get(n.id);
    return {
      id: n.id,
      titulo: n.titulo,
      estagio: n.estagio,
      temperatura: n.temperatura,
      valorEstimado: n.valorEstimado != null ? Number(n.valorEstimado) : null,
      valorProposto: n.valorProposto != null ? Number(n.valorProposto) : null,
      probabilidade: n.probabilidade,
      updatedAt: n.updatedAt.toISOString(),
      cliente: n.cliente,
      responsavel: n.responsavel,
      qtdDisciplinas: n._count.disciplinas,
      qtdContatos: n._count.contatos,
      proximaAcao: p
        ? { inicio: p.inicio.toISOString(), tipo: p.tipo, titulo: p.titulo }
        : null,
      checklist:
        itens.length > 0
          ? {
              total: itens.length,
              marcados: marcadosSet?.size ?? 0,
              percentual: Math.round(((marcadosSet?.size ?? 0) / itens.length) * 100),
              itens: itens.map((it) => ({ ...it, marcado: marcadosSet?.has(it.id) ?? false })),
            }
          : null,
    };
  });

  const totalPorEstagio = new Map(totais.map((t) => [t.estagio, t]));

  return COLUNAS_NEGOCIACAO.map((estagio) => {
    const doEstagio = cards.filter((c) => c.estagio === estagio);
    const agregado = totalPorEstagio.get(estagio);
    return {
      estagio,
      cards: doEstagio,
      /** Total REAL no banco — não o tamanho da página. */
      total: agregado?._count ?? 0,
      soma: Number(agregado?._sum.valorEstimado ?? 0),
      temMais: (agregado?._count ?? 0) > take,
    };
  });
}
export type ColunaNegociacao = Awaited<ReturnType<typeof funilNegociacao>>[number];
export type CardNegociacao = ColunaNegociacao["cards"][number];

/** Catálogo de motivos de perda para o diálogo (F2.14) — `exigeConcorrente` junto, é a regra. */
export async function motivosPerdaAtivos() {
  return prisma.motivoPerda.findMany({
    where: { ativo: true },
    orderBy: { ordem: "asc" },
    select: { id: true, nome: true, exigeConcorrente: true },
  });
}
export type MotivoPerdaOpcao = Awaited<ReturnType<typeof motivosPerdaAtivos>>[number];

/** Opções dos filtros compartilhados (F2.15) — uma consulta por catálogo, todas em paralelo. */
export async function opcoesFiltroComercial() {
  const [responsaveis, campanhas, canais, empresas, disciplinas] = await Promise.all([
    prisma.user.findMany({
      where: { ativo: true, role: { not: "cliente" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.campanha.findMany({
      where: { ativo: true },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
    prisma.canalAquisicao.findMany({
      where: { ativo: true },
      select: { id: true, nome: true },
      orderBy: { ordem: "asc" },
    }),
    // Só empresas que aparecem no comercial — a lista inteira de clientes tornaria o Select
    // inútil num escritório com centenas.
    prisma.cliente.findMany({
      where: { OR: [{ leads: { some: {} } }, { negociacoes: { some: {} } }] },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
    prisma.disciplinaCatalogo.findMany({
      where: { ativo: true },
      select: { id: true, nome: true },
      orderBy: { ordem: "asc" },
    }),
  ]);
  return { responsaveis, campanhas, canais, empresas, disciplinas };
}

export async function lerTemplatosNotas() {
  const { lerTemplates } = await import("./templates-notas");
  return lerTemplates(prisma);
}

// ── Reativação (F3.8) ────────────────────────────────────────────────────
export type EmpresaParaVincular = {
  clienteId: string;
  nome: string;
  motivo: "nome_exato" | "nome_similar";
  projetos: number;
  negociacoes: number;
  propostas: number;
};

/**
 * F3.8 — "sinal de reativação": quem digita o nome de uma empresa que JÁ existe, criando uma
 * prospecção nova do zero, está prestes a fazer o sistema esquecer o que já rolou com ela — 3
 * contratos anteriores, viram um lead órfão sem `clienteId`, exatamente como os 8 leads reais da
 * F2.18 chegaram (nenhum tinha empresa vinculada, e a ligação teve de ser feita à mão, depois).
 *
 * Reusa `candidatosDuplicata()` (F1.12/F1.13) — mesma detecção "quase igual" que já protege o
 * cadastro de Cliente contra duplicata — mas aqui o propósito é DIFERENTE: não é alertar "você
 * pode estar duplicando", é oferecer "vincule e herde o histórico". Só nome entra na comparação
 * (o formulário de lead não tem campo de documento), e só os matches fortes (nome exato ou
 * similaridade ≥ 0,85, o mesmo limiar padrão de `candidatosDuplicata`) chegam à tela — abaixo
 * disso o ruído (nome parecido mas empresa diferente) pesa mais que o ganho.
 *
 * Devolve `[]` sem histórico nenhum (não teria "reativação" a oferecer) e nome com menos de 3
 * caracteres (buscar por 1-2 letras devolveria tanta coisa que deixaria de ser sinal).
 */
export async function buscarEmpresaParaVincular(nome: string): Promise<EmpresaParaVincular[]> {
  if (!nome || nome.trim().length < 3) return [];

  const existentes = await clientesParaDedupe();
  const candidatos = candidatosDuplicata(existentes, { nome, tipo: "PJ" }).filter(
    (c): c is typeof c & { motivo: "nome_exato" | "nome_similar" } =>
      c.motivo === "nome_exato" || (c.motivo === "nome_similar" && c.score >= 0.85),
  );
  if (candidatos.length === 0) return [];

  const ids = candidatos.slice(0, 3).map((c) => c.cliente.id);
  const contagens = await prisma.cliente.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      _count: {
        select: {
          projetos: true,
          // `excluidoEm: null` EXPLÍCITO — leitura via `_count` de relação é aninhada, não passa
          // pela extensão de soft delete do `lib/prisma.ts` (mesmo ponto que a F3.7 já tratou).
          negociacoes: { where: { excluidoEm: null } },
          propostas: true,
        },
      },
    },
  });

  return candidatos
    .filter((c) => ids.includes(c.cliente.id))
    .map((c) => {
      const cont = contagens.find((x) => x.id === c.cliente.id);
      return {
        clienteId: c.cliente.id,
        nome: c.cliente.nome,
        motivo: c.motivo,
        projetos: cont?._count.projetos ?? 0,
        negociacoes: cont?._count.negociacoes ?? 0,
        propostas: cont?._count.propostas ?? 0,
      };
    })
    // Só oferece quando há de fato algo pra "reativar" — empresa cadastrada sem nenhum
    // histórico não é sinal de reativação, é só uma homônima.
    .filter((c) => c.projetos + c.negociacoes + c.propostas > 0);
}

// ── Fluxo rápido de prospecção (F4.3) ────────────────────────────
export type EmpresaCandidata = {
  id: string;
  nome: string;
  tipo: "PF" | "PJ";
  prospeccoesAtivas: { id: string; nome: string; status: StatusProspeccao }[];
};

/** Item da lista de clientes já cadastrados oferecida na entrada comercial. */
export type ClienteSelecionavel = { id: string; nome: string; tipo: "PF" | "PJ" };

/**
 * Clientes oferecidos para escolha direta na entrada comercial — o caminho "já atendi essa
 * pessoa antes" para quem não lembra o nome e não tem o que digitar: a busca por texto só ajuda
 * quem sabe ao menos um pedaço do nome.
 *
 * `ativo: true` + `fundidoEmId: null` de propósito: cliente arquivado ou ABSORVIDO por uma fusão
 * (F1.14) continua existindo no banco, e oferecê-lo aqui recriaria exatamente a duplicata que a
 * fusão resolveu. O `excluidoEm` já é filtrado pela extensão de soft delete em `lib/prisma.ts`.
 */
export async function clientesParaSelecao(): Promise<ClienteSelecionavel[]> {
  return prisma.cliente.findMany({
    where: { ativo: true, fundidoEmId: null },
    orderBy: { nome: "asc" },
    take: 500,
    select: { id: true, nome: true, tipo: true },
  });
}

/**
 * Demandas ativas de um cliente escolhido na lista. A busca por digitação já devolve isso junto
 * (`EmpresaCandidata.prospeccoesAtivas`); escolher pela lista pula aquela busca e precisa da
 * mesma informação, ou a pergunta "esta entrada pertence a qual demanda?" sumiria justamente no
 * caminho do cliente recorrente — que é onde ela mais importa.
 */
export async function prospeccoesAtivasDoCliente(
  clienteId: string,
): Promise<EmpresaCandidata["prospeccoesAtivas"]> {
  return prisma.lead.findMany({
    where: {
      clienteId,
      status: { in: [...STATUS_PROSPECCAO_ATIVOS] },
      arquivado: false,
      excluidoEm: null,
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, nome: true, status: true },
  });
}

/** Quantos candidatos a busca por digitação chega a mostrar de uma vez. */
const LIMITE_BUSCA_CLIENTE = 8;
/**
 * Teto de linhas lidas antes de ordenar por relevância. Alto de propósito: o `orderBy` do banco é
 * alfabético, então um corte apertado aconteceria ANTES do ranking e poderia descartar o nome
 * exato por causa de homônimos que só contêm o termo ("Construtora …" é prefixo comum na base).
 * Acima deste teto a ordenação volta a ser alfabética — refinar o termo resolve.
 */
const TETO_BUSCA_TEXTO = 200;

/**
 * Busca cliente enquanto o usuário digita na entrada comercial. Duas camadas, nesta ordem:
 *
 * 1. **Texto** (`contains`, token a token) — "constr" acha "Construtora Alfa" e "Construtora
 *    Beta"; "alfa" acha "Construtora Alfa" mesmo sem o começo do nome. Cada token precisa casar
 *    (AND), então digitar mais só restringe — nunca troca o resultado por outro.
 * 2. **Semelhança** (`candidatosDuplicata`, F1.12) — complementa o texto para o caso que ele não
 *    pega: erro de grafia ("konstrutora"). Só entra se o texto trouxe pouca coisa, porque exige
 *    carregar a tabela inteira (`clientesParaDedupe`).
 *
 * A busca **não** filtra por PF/PJ: um cadastro do outro tipo que some da tela é exatamente o
 * cadastro que o usuário vai duplicar. O tipo do registro escolhido é que passa a valer.
 *
 * Sem o filtro "só com histórico" do sinal de reativação (F3.8): aqui a pergunta não é "vale a
 * pena reativar", é "esse cliente já existe" — e um cliente criado AGORA MESMO (2º prospect da
 * mesma sessão, ainda sem projeto/negociação) tem que aparecer igual.
 */
export async function buscarEmpresaParaProspeccaoRapida(
  nome: string,
  tipo: "PF" | "PJ" = "PJ",
): Promise<EmpresaCandidata[]> {
  const termo = nome?.trim() ?? "";
  // 2 caracteres, não 3: "Sá", "TJ" e afins são nomes inteiros de cliente.
  if (termo.length < 2) return [];
  const tokens = tokensDeBusca(termo);
  if (tokens.length === 0) return [];

  const porTexto = await prisma.cliente.findMany({
    where: {
      ativo: true,
      fundidoEmId: null,
      // AND dos tokens, cada um podendo casar no nome OU no nome fantasia — "alfa construtora"
      // (ordem trocada) e "alfa" sozinho chegam no mesmo cadastro.
      AND: tokens.map((t) => ({
        OR: [
          { nome: { contains: t, mode: "insensitive" as const } },
          { nomeFantasia: { contains: t, mode: "insensitive" as const } },
        ],
      })),
    },
    orderBy: { nome: "asc" },
    take: TETO_BUSCA_TEXTO,
    select: { id: true, nome: true, tipo: true },
  });

  const achados = new Map(porTexto.map((c) => [c.id, c]));
  // A condição é "o `contains` NÃO saturou", e não "achei menos que o limite da tela": o
  // `contains` do banco compara texto CRU, enquanto `relevanciaNome` compara sem acento nem
  // pontuação. "Construtora São-José" casa com "sao" só do lado normalizado — se a dedupe
  // dependesse de sobrar espaço na tela, esse cadastro apareceria ou sumiria conforme quantas
  // OUTRAS linhas casaram, com o mesmo texto digitado.
  if (porTexto.length < TETO_BUSCA_TEXTO) {
    const existentes = await clientesParaDedupe();
    for (const c of candidatosDuplicata(existentes, { nome: termo, tipo })) {
      if (achados.size >= LIMITE_BUSCA_CLIENTE) break;
      if (c.motivo !== "nome_exato" && !(c.motivo === "nome_similar" && c.score >= 0.85)) continue;
      if (!achados.has(c.cliente.id)) {
        achados.set(c.cliente.id, { id: c.cliente.id, nome: c.cliente.nome, tipo: c.cliente.tipo });
      }
    }
  }

  const candidatos = [...achados.values()]
    .sort(
      (a, b) =>
        relevanciaNome(a.nome, tokens) - relevanciaNome(b.nome, tokens) ||
        a.nome.localeCompare(b.nome, "pt-BR"),
    )
    .slice(0, LIMITE_BUSCA_CLIENTE);
  if (candidatos.length === 0) return [];
  const ids = candidatos.map((c) => c.id);
  const ativas = await prisma.lead.findMany({
    where: {
      clienteId: { in: ids },
      status: { in: [...STATUS_PROSPECCAO_ATIVOS] },
      arquivado: false,
      excluidoEm: null,
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, nome: true, status: true, clienteId: true },
  });

  return candidatos.map((c) => ({
    id: c.id,
    nome: c.nome,
    tipo: c.tipo,
    prospeccoesAtivas: ativas
      .filter((lead) => lead.clienteId === c.id)
      .map(({ id, nome, status }) => ({ id, nome, status })),
  }));
}

/**
 * Busca contato DENTRO de uma empresa já resolvida — escopo menor que `candidatosDuplicata`
 * (F1.12): aqui a empresa já está decidida, então "quase igual" entre poucos contatos de UMA
 * empresa não precisa de Levenshtein — `contains` já resolve sem falso-negativo.
 */
export async function buscarContatoNaEmpresa(clienteId: string, termo: string) {
  const t = termo.trim();
  if (t.length < 2) return [];
  return prisma.contatoCliente.findMany({
    where: {
      clienteId,
      excluidoEm: null,
      OR: [
        { nome: { contains: t, mode: "insensitive" } },
        { email: { contains: t, mode: "insensitive" } },
      ],
    },
    orderBy: { nome: "asc" },
    take: 5,
    select: { id: true, nome: true, cargo: true, email: true, telefone: true, optOut: true },
  });
}

// ── Home / Meu Dia (F6.5) ────────────────────────────────────────────────────────────────────

export type HomeComercialDados = Awaited<ReturnType<typeof homeComercial>>;

/** Início do mês (dia 1, meia-noite) de um instante — usado só para os dois recortes de período. */
function inicioDoMes(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * Home do Comercial + Meu Dia (F6.5) — cards do mês (comparados com o mês anterior) e as 6 listas
 * operacionais do dia. **Poucas queries agregadas, medidas de propósito** (critério de aceite):
 *
 * 1 query traz TODAS as negociações (linha mínima de `LinhaNegociacao`) — os 4 cards de
 * pipeline/contratado/ticket são todos `metricas.ts` puro rodando em cima do MESMO array, cortado
 * em JS pelos dois `Periodo`s (não duas queries por card, não uma query por período).
 *
 * As 3 listas ancoradas em `Compromisso` (atrasados/hoje/próximas) resolvem nome de LEAD/
 * NEGOCIACAO em 2 queries EM LOTE (todos os ids de uma vez), não 1 por item — é o N+1 que
 * `resolverAncoraComercial` teria produzido se chamado por linha.
 *
 * Total: 1 (negociações) + 2 (contadores follow-up) + 3 (compromissos) + 2 (resolução em lote) +
 * 2 (propostas) + 1 (negociações sem contato) = **11 queries**, para qualquer volume de dados —
 * é o número que fica no `06-progresso.md` junto do tempo medido contra o seed da F6.2.
 */
export async function homeComercial(agora: Date, responsavelId?: string) {
  const config = await getConfigComercial();

  const inicioMesAtual = inicioDoMes(agora);
  const inicioMesAnterior = inicioDoMes(new Date(agora.getFullYear(), agora.getMonth() - 1, 1));
  const periodoAtual: PeriodoMetrica = { inicio: inicioMesAtual, fim: agora };
  const periodoAnterior: PeriodoMetrica = { inicio: inicioMesAnterior, fim: inicioMesAtual };

  const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const inicioAmanha = new Date(inicioHoje.getTime() + 86_400_000);
  const fimHorizonte = new Date(
    inicioAmanha.getTime() + config.diasHorizonteProximasAcoes * 86_400_000,
  );

  const [negRowsRaw, leadsDoResponsavel] =
    await Promise.all([
      prisma.negociacao.findMany({
        where: { responsavelId },
        select: {
          id: true,
          estagio: true,
          createdAt: true,
          dataFechamento: true,
          previsaoFechamento: true,
          valorNegociado: true,
          valorProposto: true,
          valorEstimado: true,
          probabilidade: true,
          leadId: true,
          clienteId: true,
          cliente: { select: { fundidoEmId: true } },
        },
      }),
      responsavelId
        ? prisma.lead.findMany({ where: { responsavelId }, select: { id: true } })
        : Promise.resolve([]),
    ]);

  const idsDeEntidadesDoResponsavel = {
    lead: leadsDoResponsavel.map((lead) => lead.id),
    negociacao: negRowsRaw.map((negociacao) => negociacao.id),
  };
  const whereCompromissoDoResponsavel = responsavelId
    ? {
        OR: [
          { entidadeTipo: "LEAD" as const, entidadeId: { in: idsDeEntidadesDoResponsavel.lead } },
          { entidadeTipo: "NEGOCIACAO" as const, entidadeId: { in: idsDeEntidadesDoResponsavel.negociacao } },
        ],
      }
    : {};

  const [followUpsHojeCount, followUpsAtrasadosCount, atrasados, hoje, proximas, propostasAguardando, propostasVencendoBruto, semContato] =
    await Promise.all([
      prisma.compromisso.count({
        where: {
          tipo: { not: null },
          concluidoEm: null,
          inicio: { gte: inicioHoje, lt: inicioAmanha },
          ...whereCompromissoDoResponsavel,
        },
      }),
      prisma.compromisso.count({
        where: {
          tipo: { not: null }, concluidoEm: null, inicio: { lt: inicioHoje },
          ...whereCompromissoDoResponsavel,
        },
      }),
      prisma.compromisso.findMany({
        where: {
          tipo: { not: null }, concluidoEm: null, inicio: { lt: inicioHoje },
          ...whereCompromissoDoResponsavel,
        },
        orderBy: { inicio: "asc" },
        take: 8,
        select: { id: true, titulo: true, inicio: true, tipo: true, entidadeTipo: true, entidadeId: true },
      }),
      prisma.compromisso.findMany({
        where: {
          tipo: { not: null },
          concluidoEm: null,
          inicio: { gte: inicioHoje, lt: inicioAmanha },
          ...whereCompromissoDoResponsavel,
        },
        orderBy: { inicio: "asc" },
        take: 8,
        select: { id: true, titulo: true, inicio: true, tipo: true, entidadeTipo: true, entidadeId: true },
      }),
      prisma.compromisso.findMany({
        where: {
          tipo: { not: null },
          concluidoEm: null,
          inicio: { gte: inicioAmanha, lt: fimHorizonte },
          ...whereCompromissoDoResponsavel,
        },
        orderBy: { inicio: "asc" },
        take: 8,
        select: { id: true, titulo: true, inicio: true, tipo: true, entidadeTipo: true, entidadeId: true },
      }),
      prisma.proposta.findMany({
        where: { status: "enviada", negociacao: responsavelId ? { responsavelId } : undefined },
        orderBy: { enviadaEm: "asc" },
        take: 8,
        select: { id: true, numero: true, titulo: true, enviadaEm: true, cliente: { select: { nome: true } } },
      }),
      // Pré-filtro grosso em SQL (folga de 1 dia pro fuso — o corte fino é `diasAteVencer`, que
      // decide em America/Recife, mesmo motivo do F5.6). O que decide "entra na lista" é o
      // `diasAteVencer` abaixo, não este `where`.
      prisma.proposta.findMany({
        where: {
          status: "enviada",
          negociacao: responsavelId ? { responsavelId } : undefined,
          validade: {
            not: null,
            lte: new Date(agora.getTime() + (config.diasAvisoValidadeProposta + 1) * 86_400_000),
          },
        },
        select: { id: true, numero: true, titulo: true, validade: true, cliente: { select: { nome: true } } },
      }),
      prisma.negociacao.findMany({
        where: {
          estagio: { in: [...ESTAGIOS_PIPELINE_ABERTO] },
          responsavelId,
          updatedAt: { lt: new Date(agora.getTime() - config.diasSemContato * 86_400_000) },
        },
        orderBy: { updatedAt: "asc" },
        take: 8,
        select: { id: true, titulo: true, updatedAt: true, cliente: { select: { nome: true } } },
      }),
    ]);

  const negRows: LinhaNegociacao[] = negRowsRaw.map((n) => ({
    id: n.id,
    estagio: n.estagio,
    criadoEm: n.createdAt,
    dataFechamento: n.dataFechamento,
    previsaoFechamento: n.previsaoFechamento,
    valorNegociado: n.valorNegociado != null ? Number(n.valorNegociado) : null,
    valorProposto: n.valorProposto != null ? Number(n.valorProposto) : null,
    valorEstimado: n.valorEstimado != null ? Number(n.valorEstimado) : null,
    probabilidade: n.probabilidade,
    empresaId: n.cliente.fundidoEmId ?? n.clienteId,
    leadId: n.leadId,
  }));

  // Resolução em LOTE dos itens de Compromisso (evita N+1 de `resolverAncoraComercial`).
  const todosCompromissos = [...atrasados, ...hoje, ...proximas];
  const leadIds = [...new Set(todosCompromissos.filter((c) => c.entidadeTipo === "LEAD").map((c) => c.entidadeId!))];
  const negIds = [...new Set(todosCompromissos.filter((c) => c.entidadeTipo === "NEGOCIACAO").map((c) => c.entidadeId!))];
  const [leadsResolvidos, negsResolvidas] = await Promise.all([
    leadIds.length
      ? prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, nome: true } })
      : Promise.resolve([]),
    negIds.length
      ? prisma.negociacao.findMany({
          where: { id: { in: negIds } },
          select: { id: true, titulo: true, cliente: { select: { nome: true } } },
        })
      : Promise.resolve([]),
  ]);
  const nomeLead = new Map(leadsResolvidos.map((l) => [l.id, l.nome]));
  const nomeNeg = new Map(negsResolvidas.map((n) => [n.id, `${n.cliente.nome} — ${n.titulo}`]));

  const resolverItem = (c: (typeof todosCompromissos)[number]) => ({
    id: c.id,
    titulo: c.titulo,
    inicio: c.inicio.toISOString(),
    tipo: c.tipo,
    href:
      c.entidadeTipo === "LEAD"
        ? `/comercial/prospeccao?lead=${c.entidadeId}`
        : "/comercial/negociacoes",
    nomeEntidade:
      (c.entidadeTipo === "LEAD" ? nomeLead.get(c.entidadeId!) : nomeNeg.get(c.entidadeId!)) ??
      "(sem nome)",
  });

  const propostasVencendo = propostasVencendoBruto
    .map((p) => ({ ...p, dias: diasAteVencer(p.validade, agora) }))
    .filter((p) => p.dias != null && p.dias >= 0 && p.dias <= config.diasAvisoValidadeProposta)
    .sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0))
    .slice(0, 8);

  return {
    cards: {
      contratadoMes: {
        atual: valorContratado(negRows, periodoAtual).total,
        anterior: valorContratado(negRows, periodoAnterior).total,
      },
      contratosFechados: {
        atual: valorContratado(negRows, periodoAtual).quantidade,
        anterior: valorContratado(negRows, periodoAnterior).quantidade,
      },
      ticketMedio: {
        atual: ticketMedioPorContrato(negRows, periodoAtual),
        anterior: ticketMedioPorContrato(negRows, periodoAnterior),
      },
      pipelineAberto: pipelineAberto(negRows).total,
      pipelinePonderado: pipelinePonderado(negRows),
      followUpsHoje: followUpsHojeCount,
      followUpsAtrasados: followUpsAtrasadosCount,
    },
    meuDia: {
      followUpsAtrasados: atrasados.map(resolverItem),
      contatosHoje: hoje.map(resolverItem),
      proximasAcoes: proximas.map(resolverItem),
      propostasAguardandoRetorno: propostasAguardando.map((p) => ({
        id: p.id,
        numero: p.numero,
        titulo: p.titulo,
        clienteNome: p.cliente.nome,
        enviadaEm: p.enviadaEm?.toISOString() ?? null,
        href: `/comercial/propostas/${p.id}`,
      })),
      propostasPertoDoVencimento: propostasVencendo.map((p) => ({
        id: p.id,
        numero: p.numero,
        titulo: p.titulo,
        clienteNome: p.cliente.nome,
        dias: p.dias,
        href: `/comercial/propostas/${p.id}`,
      })),
      oportunidadesSemContato: semContato.map((n) => ({
        id: n.id,
        titulo: n.titulo,
        clienteNome: n.cliente.nome,
        diasSemContato: Math.floor((agora.getTime() - n.updatedAt.getTime()) / 86_400_000),
        href: "/comercial/negociacoes",
      })),
    },
  };
}
