import "server-only";
import { prisma } from "@/lib/prisma";
import { ESTAGIOS_ATIVOS } from "@/modules/comercial/jornada";
import { ultimaInteracaoDe } from "@/modules/comercial/atividade";
import type { EstagioNegociacao, Temperatura } from "@/generated/prisma/client";

/**
 * F3.7 — **Empresa 360**: "tudo o que já aconteceu com esta empresa" numa leitura só.
 *
 * ── Orçamento de queries (o aceite da tarefa: ≤ 5, nenhuma em laço) ──────────────────────────
 * São **4 chamadas** ao client do Prisma, e o `scripts/smoke-crm-fase3.ts` conta e trava esse
 * número:
 *
 *   1. `cliente.findUnique` — cadastro + as 6 listas das abas + os `_count` dos indicadores
 *   2. `negociacao.groupBy(estagio)` — abertas / encerradas / contratadas de uma vez
 *   3. `projeto.aggregate` — valor acumulado e ticket médio
 *   4. `compromisso.findMany` — próxima ação (âncora polimórfica, sem FK: não dá para incluir)
 *
 * 1–3 saem em paralelo (só precisam do `clienteId`). A 4 é sequencial de propósito: depende dos
 * ids carregados em 1 — mas é **uma** consulta com `entidadeId: { in: [...] }`, não uma por
 * card, que é justamente o N+1 que o aceite proíbe.
 *
 * ── Por que os números de dinheiro vêm de `Projeto`, e não de `Negociacao`/`Proposta` ────────
 * Porque é onde o dinheiro real está. A auditoria de produção (2026-08-13) achou 31 projetos
 * contra 1 proposta sem itens e 0 negociações — o módulo Comercial é *contornado*, o trabalho
 * entra direto como `Projeto`. Uma Empresa 360 que derivasse "valor acumulado" das tabelas
 * comerciais mostraria **R$ 0 para toda empresa real**, matando exatamente a tela que deveria
 * justificar o registro das fases anteriores. `Negociacao` alimenta os indicadores de FUNIL
 * (abertas/encerradas), que é o que ela sabe responder hoje.
 *
 * ── Toda lista é limitada (`take`) ───────────────────────────────────────────────────────────
 * O outro lado do aceite ("empresa com 50 projetos abre em tempo comparável a uma com 1") não é
 * só contar queries: uma query só que devolve 500 atividades para um Client Component custa
 * caro do mesmo jeito. Os totais vêm sempre de `_count`/`aggregate` — **nunca** de
 * `array.length`, que contaria só a página carregada e mentiria na tela.
 */

/** Quanto cada aba carrega de primeira. O `<Timeline>` (F3.6) pagina o resto no cliente. */
export const TAKE_LISTA = 25;
export const TAKE_TIMELINE = 50;
export const TAKE_CONTATOS = 50;

export type Empresa360 = NonNullable<Awaited<ReturnType<typeof empresa360>>>;

export async function empresa360(clienteId: string) {
  const [cliente, porEstagio, agregadoProjetos] = await Promise.all([
    // ── 1 ──────────────────────────────────────────────────────────────────────────────────
    prisma.cliente.findUnique({
      where: { id: clienteId },
      select: {
        id: true,
        nome: true,
        status: true,
        statusOverride: true,
        cidade: true,
        uf: true,
        porte: true,
        createdAt: true,
        segmento: { select: { nome: true } },

        // `excluidoEm: null` EXPLÍCITO nas três: leitura ANINHADA não passa pela extensão de
        // soft delete do `lib/prisma.ts` — que, aliás, já antecipava este ponto no comentário
        // sobre `Cliente.negociacoes` "na Empresa 360 (Fase 3)".
        contatos: {
          where: { excluidoEm: null },
          orderBy: [{ principal: "desc" }, { nome: "asc" }],
          take: TAKE_CONTATOS,
          select: {
            id: true,
            nome: true,
            cargo: true,
            email: true,
            telefone: true,
            principal: true,
            optOut: true,
            statusRelacionamento: true,
          },
        },
        leads: {
          where: { excluidoEm: null },
          orderBy: { updatedAt: "desc" },
          take: TAKE_LISTA,
          select: {
            id: true,
            nome: true,
            status: true,
            temperatura: true,
            valorEstimado: true,
            origemDetalhada: true,
            updatedAt: true,
            responsavel: { select: { id: true, name: true } },
          },
        },
        negociacoes: {
          where: { excluidoEm: null },
          orderBy: { updatedAt: "desc" },
          take: TAKE_LISTA,
          select: {
            id: true,
            titulo: true,
            estagio: true,
            temperatura: true,
            probabilidade: true,
            valorEstimado: true,
            valorProposto: true,
            valorNegociado: true,
            previsaoFechamento: true,
            updatedAt: true,
            responsavel: { select: { id: true, name: true } },
          },
        },
        propostas: {
          orderBy: { createdAt: "desc" },
          take: TAKE_LISTA,
          select: {
            id: true,
            numero: true,
            titulo: true,
            status: true,
            enviadaEm: true,
            aceitaEm: true,
            createdAt: true,
          },
        },
        projetos: {
          orderBy: { createdAt: "desc" },
          take: TAKE_LISTA,
          select: {
            id: true,
            codigo: true,
            nome: true,
            situacao: true,
            valorContrato: true,
            createdAt: true,
          },
        },
        atividadesComerciais: {
          orderBy: { createdAt: "desc" },
          take: TAKE_TIMELINE,
          select: {
            id: true,
            tipo: true,
            descricao: true,
            createdAt: true,
            autor: { select: { name: true, image: true } },
          },
        },

        // Os `_count` repetem o `where` das listas de propósito: sem isso o número do indicador
        // contaria registro soft-deletado e não bateria com a aba ao lado.
        _count: {
          select: {
            contatos: { where: { excluidoEm: null } },
            leads: { where: { excluidoEm: null } },
            negociacoes: { where: { excluidoEm: null } },
            propostas: true,
            projetos: true,
            atividadesComerciais: true,
          },
        },
      },
    }),

    // ── 2 ──────────────────────────────────────────────────────────────────────────────────
    // `groupBy` num golpe só em vez de três `count` com `where` diferente. Top-level: a
    // extensão de soft delete injeta `excluidoEm: null` sozinha aqui.
    prisma.negociacao.groupBy({
      by: ["estagio"],
      where: { clienteId },
      _count: { _all: true },
    }),

    // ── 3 ──────────────────────────────────────────────────────────────────────────────────
    prisma.projeto.aggregate({
      where: { clienteId },
      _sum: { valorContrato: true },
      _avg: { valorContrato: true },
      _max: { createdAt: true },
    }),
  ]);

  if (!cliente) return null;

  // ── 4 ────────────────────────────────────────────────────────────────────────────────────
  // Uma consulta para TODAS as âncoras desta empresa. A alternativa óbvia — `proximasAcoesDe`
  // por lead e por negociação — seria uma ida ao banco por card, o N+1 que o aceite proíbe.
  // (`proximasAcoesDe` continua servindo a ficha de UMA entidade; aqui a pergunta é outra.)
  const ancoras = [
    ...cliente.leads.map((l) => l.id),
    ...cliente.negociacoes.map((n) => n.id),
    cliente.id,
  ];
  const proximasAcoes = await prisma.compromisso.findMany({
    where: {
      entidadeId: { in: ancoras },
      entidadeTipo: { in: ["LEAD", "NEGOCIACAO", "CLIENTE"] },
      tipo: { not: null },
      concluidoEm: null,
    },
    orderBy: { inicio: "asc" },
    take: TAKE_LISTA,
    select: {
      id: true,
      titulo: true,
      tipo: true,
      inicio: true,
      local: true,
      entidadeTipo: true,
      entidadeId: true,
    },
  });

  // ── Derivados (puros, sem mais I/O) ──────────────────────────────────────────────────────
  const ativas = new Set<EstagioNegociacao>(ESTAGIOS_ATIVOS);
  let negociacoesAbertas = 0;
  let negociacoesEncerradas = 0;
  let contratos = 0;
  for (const g of porEstagio) {
    const n = g._count._all;
    if (ativas.has(g.estagio)) negociacoesAbertas += n;
    else negociacoesEncerradas += n;
    if (g.estagio === "CONTRATADO") contratos += n;
  }

  /**
   * Responsável e temperatura "da empresa" não são colunas de `Cliente` — são o que está valendo
   * na frente comercial mais recente. Negociação vence prospecção: se a empresa já está
   * negociando, é esse o dado que importa na hora de ligar.
   */
  const frenteAtiva =
    cliente.negociacoes.find((n) => ativas.has(n.estagio)) ??
    cliente.negociacoes[0] ??
    null;
  const prospeccaoRecente = cliente.leads[0] ?? null;

  const responsavel = frenteAtiva?.responsavel ?? prospeccaoRecente?.responsavel ?? null;
  const temperatura: Temperatura | null =
    frenteAtiva?.temperatura ?? prospeccaoRecente?.temperatura ?? null;

  return {
    cliente: {
      id: cliente.id,
      nome: cliente.nome,
      /// `statusOverride` VENCE o calculado — é o único caminho para EX_CLIENTE/PARCEIRO (ADR-08).
      classificacao: cliente.statusOverride ?? cliente.status,
      classificacaoManual: cliente.statusOverride != null,
      cidade: cliente.cidade,
      uf: cliente.uf,
      porte: cliente.porte,
      segmento: cliente.segmento?.nome ?? null,
      clienteDesde: cliente.createdAt,
    },
    resumo: {
      responsavel,
      temperatura,
      /// Derivado da timeline (F2.11), não uma coluna — `take` não atrapalha: o mais recente
      /// está sempre na primeira página, que vem ordenada desc.
      ultimoContato: ultimaInteracaoDe(cliente.atividadesComerciais),
      /// A mais próxima no tempo entre todas as âncoras da empresa.
      proximaAcao: proximasAcoes[0] ?? null,
      ultimoContrato: agregadoProjetos._max.createdAt,
    },
    indicadores: {
      contatos: cliente._count.contatos,
      prospeccoes: cliente._count.leads,
      negociacoesAbertas,
      negociacoesEncerradas,
      contratos,
      propostas: cliente._count.propostas,
      projetos: cliente._count.projetos,
      /// De `Projeto.valorContrato` — ver o cabeçalho deste arquivo para o porquê.
      valorAcumulado: Number(agregadoProjetos._sum.valorContrato ?? 0),
      ticketMedio: Number(agregadoProjetos._avg.valorContrato ?? 0),
      eventosTimeline: cliente._count.atividadesComerciais,
    },
    contatos: cliente.contatos,
    prospeccoes: cliente.leads.map((l) => ({
      ...l,
      valorEstimado: l.valorEstimado != null ? Number(l.valorEstimado) : null,
    })),
    negociacoes: cliente.negociacoes.map((n) => ({
      ...n,
      valorEstimado: n.valorEstimado != null ? Number(n.valorEstimado) : null,
      valorProposto: n.valorProposto != null ? Number(n.valorProposto) : null,
      valorNegociado: n.valorNegociado != null ? Number(n.valorNegociado) : null,
    })),
    propostas: cliente.propostas,
    projetos: cliente.projetos.map((p) => ({
      ...p,
      valorContrato: p.valorContrato != null ? Number(p.valorContrato) : null,
    })),
    timeline: cliente.atividadesComerciais,
    proximasAcoes,
  };
}
