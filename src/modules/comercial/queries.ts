import "server-only";
import { prisma } from "@/lib/prisma";
import { nomeDisciplinaItem } from "@/modules/comercial/disciplinas";
import {
  STATUS_PROSPECCAO_ATIVOS,
  COLUNAS_PROSPECCAO,
} from "@/modules/comercial/prospeccao";
import { ESTAGIOS_ATIVOS } from "@/modules/comercial/jornada";
import type { TipoAncoraCompromisso } from "@/generated/prisma/client";
import {
  whereProspeccao,
  whereNegociacao,
  type FiltrosComerciais,
} from "@/modules/comercial/filtros";
import { candidatosDuplicata } from "@/modules/comercial/dedupe";
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
      // F3.1: timeline nova. Nome do relation (`atividadesComerciais`) mantido distinto de
      // `atividades` (a legada) — a mesclagem dos dois em ordem cronológica única acontece na
      // camada de exibição (`mesclarTimeline`, F2.11), não aqui.
      atividadesComerciais: {
        orderBy: { createdAt: "desc" },
        include: { autor: { select: { name: true } } },
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
export async function funilProspeccao(filtros?: FiltrosComerciais, agora: Date = new Date()) {
  const leads = await prisma.lead.findMany({
    where: {
      status: { in: [...COLUNAS_PROSPECCAO] },
      arquivado: false,
      ...(filtros ? whereProspeccao(filtros, agora) : {}),
    },
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

/** Quantos cards por coluna vêm na primeira carga (F2.14 pede paginação por coluna). */
export const PAGINA_COLUNA = 25;

/**
 * Board de negociações.
 *
 * **Duas consultas no total, independentemente de quantas colunas ou cards** — é o aceite
 * ("1 query para montar o board, sem N+1"). A primeira traz as negociações com tudo do card
 * resolvido por `select` (cliente, responsável, disciplinas contadas); a segunda traz as próximas
 * ações de todas elas em lote, porque a âncora é polimórfica e sem FK (ver F2.10) e o Prisma não
 * junta relação que não existe no schema.
 *
 * O ingênuo aqui seria uma consulta por coluna (8) mais uma por card para a próxima ação — com
 * 200 cards seriam 208 idas ao banco para desenhar uma tela.
 *
 * **Contagem e soma vêm do banco, não do array paginado.** Se viessem do array, uma coluna com
 * 200 registros mostraria "25" e somaria só a primeira página — o número no topo da coluna
 * mentiria justamente onde ele mais importa.
 */
export async function funilNegociacao(opts?: {
  pagina?: number;
  filtros?: FiltrosComerciais;
  agora?: Date;
}) {
  const take = PAGINA_COLUNA * (opts?.pagina ?? 1);
  // MESMO `where` no groupBy e no findMany: se divergissem, o contador da coluna deixaria de
  // bater com os cards exibidos exatamente quando houvesse filtro — o pior momento possível.
  const where = opts?.filtros ? whereNegociacao(opts.filtros, opts.agora ?? new Date()) : {};

  const [totais, negociacoes] = await Promise.all([
    prisma.negociacao.groupBy({
      by: ["estagio"],
      where,
      _count: true,
      _sum: { valorEstimado: true },
    }),
    prisma.negociacao.findMany({
      where,
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
    }),
  ]);

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

  const cards = negociacoes.map((n) => {
    const p = proxima.get(n.id);
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
    };
  });

  const totalPorEstagio = new Map(totais.map((t) => [t.estagio, t]));

  return COLUNAS_NEGOCIACAO.map((estagio) => {
    const doEstagio = cards.filter((c) => c.estagio === estagio);
    const agregado = totalPorEstagio.get(estagio);
    return {
      estagio,
      cards: doEstagio.slice(0, take),
      /** Total REAL no banco — não o tamanho da página. */
      total: agregado?._count ?? 0,
      soma: Number(agregado?._sum.valorEstimado ?? 0),
      temMais: doEstagio.length > take,
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
