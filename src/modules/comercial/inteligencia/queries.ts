import "server-only";

import { prisma } from "@/lib/prisma";
import { opcoesFiltroComercial } from "@/modules/comercial/queries";
import { ESTAGIO_NEGOCIACAO_LABEL } from "@/modules/comercial/labels";
import {
  analisarInteligencia,
  type ContratoHistorico,
  type LeadAnalitico,
  type NegociacaoAnalitica,
  type PropostaAnalitica,
} from "@/modules/comercial/inteligencia/analise";
import {
  periodoInteligencia,
  temRecorteDaNegociacao,
  whereLeadInteligencia,
  whereNegociacaoInteligencia,
  type FiltrosInteligencia,
} from "@/modules/comercial/inteligencia/filtros";
import type { EtapaAlcancada } from "@/modules/comercial/metricas";
import { getConfigComercial } from "@/modules/comercial/config/queries";
import { dataCivilRecife } from "@/modules/comercial/validade";
import {
  CHAVE_FILTROS_SALVOS,
  parseFiltrosSalvos,
} from "@/modules/comercial/inteligencia/filtros-salvos";

const SEM_INFORMACAO = { id: null, nome: "Não informado" } as const;
function dimensao(item: { id: string; nome: string } | null) {
  return item ?? SEM_INFORMACAO;
}

function corteDias(agora: Date, dias: number): Date {
  return new Date(agora.getTime() - dias * 86_400_000);
}

function diasDesde(data: Date, agora: Date): number {
  const civilUtc = (valor: Date) => {
    const [ano, mes, dia] = dataCivilRecife(valor).split("-").map(Number);
    return Date.UTC(ano, mes - 1, dia);
  };
  return Math.max(0, Math.floor((civilUtc(agora) - civilUtc(data)) / 86_400_000));
}

export async function filtrosSalvosInteligencia(userId: string) {
  const pref = await prisma.userPreference.findUnique({ where: { userId } });
  const dados = (pref?.dados as Record<string, unknown> | null) ?? {};
  return parseFiltrosSalvos(dados[CHAVE_FILTROS_SALVOS]);
}

type ClienteReativacaoRaw = {
  id: string;
  nome: string;
  ultimoContratoEm: Date;
  contratos: bigint;
};

/** F6.8 — filas determinísticas, limitadas e governadas pelos limiares de `ConfigSistema`. */
export async function listasReativacao(agora: Date) {
  const config = await getConfigComercial();
  const corteContato = corteDias(agora, config.diasSemContato);
  const corteInativo = corteDias(agora, config.diasClienteInativo);
  const corteReativacao = corteDias(agora, config.diasParaReativar);

  const [prospects, empresas, emEspera, clientesInativosRaw, clientesReativacaoRaw] =
    await Promise.all([
      prisma.lead.findMany({
        where: {
          status: "QUALIFICADO",
          createdAt: { lte: corteContato },
          atividadesComerciais: { none: { createdAt: { gt: corteContato } } },
        },
        orderBy: { updatedAt: "asc" },
        take: 50,
        select: {
          id: true,
          nome: true,
          createdAt: true,
          cliente: { select: { nome: true } },
          responsavel: { select: { name: true } },
          atividadesComerciais: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      }),
      prisma.cliente.findMany({
        where: {
          createdAt: { lte: corteContato },
          atividadesComerciais: { none: { createdAt: { gt: corteContato } } },
        },
        orderBy: { updatedAt: "asc" },
        take: 50,
        select: {
          id: true,
          nome: true,
          createdAt: true,
          atividadesComerciais: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      }),
      prisma.negociacao.findMany({
        where: { estagio: "EM_ESPERA" },
        orderBy: { updatedAt: "asc" },
        take: 50,
        select: {
          id: true,
          titulo: true,
          updatedAt: true,
          cliente: { select: { nome: true } },
          responsavel: { select: { name: true } },
        },
      }),
      prisma.$queryRaw<ClienteReativacaoRaw[]>`
        SELECT c.id, c.nome,
               MAX(n."dataFechamento") AS "ultimoContratoEm",
               COUNT(*)::bigint AS contratos
        FROM cliente c
        JOIN negociacao n ON n."clienteId" = c.id
        WHERE c."excluidoEm" IS NULL
          AND n."excluidoEm" IS NULL
          AND n.estagio = 'CONTRATADO'
          AND n."dataFechamento" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM negociacao aberta
            WHERE aberta."clienteId" = c.id
              AND aberta."excluidoEm" IS NULL
              AND aberta.estagio IN ('LEVANTAMENTO','ORCAMENTO','PROPOSTA_ENVIADA','NEGOCIACAO','EM_ESPERA')
          )
        GROUP BY c.id, c.nome
        HAVING MAX(n."dataFechamento") <= ${corteInativo}
        ORDER BY MAX(n."dataFechamento") ASC
        LIMIT 50
      `,
      prisma.$queryRaw<ClienteReativacaoRaw[]>`
        SELECT c.id, c.nome,
               MAX(n."dataFechamento") AS "ultimoContratoEm",
               COUNT(*)::bigint AS contratos
        FROM cliente c
        JOIN negociacao n ON n."clienteId" = c.id
        WHERE c."excluidoEm" IS NULL
          AND n."excluidoEm" IS NULL
          AND n.estagio = 'CONTRATADO'
          AND n."dataFechamento" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM negociacao aberta
            WHERE aberta."clienteId" = c.id
              AND aberta."excluidoEm" IS NULL
              AND aberta.estagio IN ('LEVANTAMENTO','ORCAMENTO','PROPOSTA_ENVIADA','NEGOCIACAO','EM_ESPERA')
          )
        GROUP BY c.id, c.nome
        HAVING COUNT(*) >= 2
           AND MAX(n."dataFechamento") <= ${corteReativacao}
        ORDER BY MAX(n."dataFechamento") ASC
        LIMIT 50
      `,
    ]);

  return {
    limiares: {
      diasSemContato: config.diasSemContato,
      diasClienteInativo: config.diasClienteInativo,
      diasParaReativar: config.diasParaReativar,
    },
    prospectsEsquecidos: prospects.map((lead) => {
      const ultima = lead.atividadesComerciais[0]?.createdAt ?? lead.createdAt;
      return {
        id: lead.id,
        nome: lead.nome,
        detalhe: `${lead.cliente?.nome ?? "Empresa não vinculada"} · ${diasDesde(ultima, agora)} dias sem contato`,
        responsavel: lead.responsavel?.name ?? null,
        href: `/comercial/${lead.id}`,
      };
    }),
    empresasSemInteracao: empresas.map((empresa) => {
      const ultima = empresa.atividadesComerciais[0]?.createdAt ?? empresa.createdAt;
      return {
        id: empresa.id,
        nome: empresa.nome,
        detalhe: `${diasDesde(ultima, agora)} dias sem interação registrada`,
        responsavel: null,
        href: `/clientes/${empresa.id}`,
      };
    }),
    clientesInativos: clientesInativosRaw.map((cliente) => ({
      id: cliente.id,
      nome: cliente.nome,
      detalhe: `${diasDesde(cliente.ultimoContratoEm, agora)} dias desde o último contrato`,
      responsavel: null,
      href: `/clientes/${cliente.id}`,
    })),
    negociacoesEmEspera: emEspera.map((negociacao) => ({
      id: negociacao.id,
      nome: negociacao.titulo,
      detalhe: `${negociacao.cliente.nome} · atualizada há ${diasDesde(negociacao.updatedAt, agora)} dias`,
      responsavel: negociacao.responsavel?.name ?? null,
        href: `/comercial/negociacoes?negociacao=${negociacao.id}`,
    })),
    clientesParaReativar: clientesReativacaoRaw.map((cliente) => ({
      id: cliente.id,
      nome: cliente.nome,
      detalhe: `${Number(cliente.contratos)} contratos · ${diasDesde(cliente.ultimoContratoEm, agora)} dias parado`,
      responsavel: null,
      href: `/clientes/${cliente.id}`,
    })),
  };
}

export type ListasReativacaoDados = Awaited<ReturnType<typeof listasReativacao>>;

/** Catálogos usados pelos filtros globais da Inteligência, todos lidos em paralelo. */
export async function opcoesFiltroInteligencia() {
  const [base, segmentos, tiposEmpreendimento, ufsRaw, parceiros] = await Promise.all([
    opcoesFiltroComercial(),
    prisma.segmento.findMany({
      where: { ativo: true },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      select: { id: true, nome: true },
    }),
    prisma.tipoEmpreendimento.findMany({
      where: { ativo: true },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      select: { id: true, nome: true },
    }),
    prisma.cliente.findMany({
      where: { uf: { not: null } },
      distinct: ["uf"],
      orderBy: { uf: "asc" },
      select: { uf: true },
    }),
    prisma.parceiro.findMany({
      where: { ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
  ]);
  return {
    base,
    inteligencia: {
      segmentos,
      tiposEmpreendimento,
      ufs: ufsRaw.flatMap((item) => (item.uf ? [item.uf] : [])),
      parceiros,
    },
  };
}

/**
 * Leitura única da página F6.7. O período não entra no `where` geral: cada métrica possui seu
 * próprio campo de data (`createdAt`, `enviadaEm` ou `dataFechamento`) conforme o dicionário.
 */
export async function inteligenciaComercial(
  filtros: FiltrosInteligencia,
  agora: Date,
) {
  const whereNegociacao = whereNegociacaoInteligencia(filtros);
  const whereLead = whereLeadInteligencia(filtros);

  const [negociacoesRaw, leadsRaw, contratosHistoricosRaw] = await Promise.all([
    prisma.negociacao.findMany({
      where: whereNegociacao,
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
        canal: { select: { id: true, nome: true } },
        campanha: { select: { id: true, nome: true } },
        tipoEmpreendimento: { select: { id: true, nome: true } },
        disciplinas: {
          select: { disciplina: { select: { id: true, nome: true } } },
        },
      },
    }),
    prisma.lead.findMany({
      where: whereLead,
      select: {
        id: true,
        createdAt: true,
        clienteId: true,
        cliente: { select: { fundidoEmId: true } },
        canal: { select: { id: true, nome: true } },
        campanha: { select: { id: true, nome: true } },
      },
    }),
    prisma.negociacao.findMany({
      where: { estagio: "CONTRATADO", dataFechamento: { not: null } },
      select: {
        id: true,
        clienteId: true,
        cliente: { select: { fundidoEmId: true } },
        dataFechamento: true,
        valorNegociado: true,
      },
    }),
  ]);

  const negociacoes: NegociacaoAnalitica[] = negociacoesRaw.map((n) => ({
    id: n.id,
    estagio: n.estagio,
    criadoEm: n.createdAt,
    dataFechamento: n.dataFechamento,
    previsaoFechamento: n.previsaoFechamento,
    valorNegociado: n.valorNegociado == null ? null : Number(n.valorNegociado),
    valorProposto: n.valorProposto == null ? null : Number(n.valorProposto),
    valorEstimado: n.valorEstimado == null ? null : Number(n.valorEstimado),
    probabilidade: n.probabilidade,
    empresaId: n.cliente.fundidoEmId ?? n.clienteId,
    leadId: n.leadId,
    canal: dimensao(n.canal),
    campanha: dimensao(n.campanha),
    tipoEmpreendimento: dimensao(n.tipoEmpreendimento),
    disciplinas: n.disciplinas.map((d) => d.disciplina),
  }));
  const leads: LeadAnalitico[] = leadsRaw.map((l) => ({
    id: l.id,
    criadoEm: l.createdAt,
    empresaId: l.cliente?.fundidoEmId ?? l.clienteId ?? `lead:${l.id}`,
    canal: dimensao(l.canal),
    campanha: dimensao(l.campanha),
  }));
  const contratosHistoricos: ContratoHistorico[] = contratosHistoricosRaw.flatMap((n) =>
    n.dataFechamento
      ? [
          {
            id: n.id,
            empresaId: n.cliente.fundidoEmId ?? n.clienteId,
            dataFechamento: n.dataFechamento,
            valorNegociado: n.valorNegociado == null ? null : Number(n.valorNegociado),
          },
        ]
      : [],
  );

  const negociacaoIds = negociacoes.map((n) => n.id);
  const incluirSemNegociacao = !temRecorteDaNegociacao(filtros);
  const [propostasRaw, atividades] = negociacaoIds.length || incluirSemNegociacao
    ? await Promise.all([
        prisma.proposta.findMany({
          where: incluirSemNegociacao
            ? {
                OR: [
                  { negociacaoId: { in: negociacaoIds } },
                  { negociacaoId: null },
                ],
              }
            : { negociacaoId: { in: negociacaoIds } },
          select: {
            id: true,
            negociacaoId: true,
            enviadaEm: true,
            versoes: {
              orderBy: { numero: "desc" },
              take: 1,
              select: {
                valorOriginal: true,
                desconto: true,
                createdAt: true,
              },
            },
            itens: {
              select: { disciplinaId: true, valor: true },
            },
          },
        }),
        negociacaoIds.length
          ? prisma.atividade.findMany({
              where: { negociacaoId: { in: negociacaoIds }, tipo: "SISTEMA" },
              select: { negociacaoId: true, metadata: true },
            })
          : Promise.resolve([]),
      ])
    : [[], []];

  const propostas: PropostaAnalitica[] = propostasRaw.map((p) => {
    const versao = p.versoes[0];
    return {
        id: p.id,
        negociacaoId: p.negociacaoId,
        enviadaEm: p.enviadaEm,
        versao:
          versao?.valorOriginal != null
            ? {
                valorOriginal: Number(versao.valorOriginal),
                desconto: versao.desconto == null ? null : Number(versao.desconto),
                criadoEm: versao.createdAt,
              }
            : null,
        itens: p.itens.map((item) => ({
          disciplinaId: item.disciplinaId,
          valor: Number(item.valor),
        })),
      };
  });
  const etapasAlcancadas: EtapaAlcancada[] = atividades.flatMap((atividade) => {
    const metadata = atividade.metadata as { evento?: string; para?: string } | null;
    if (
      !atividade.negociacaoId ||
      metadata?.evento !== "ESTAGIO_ALTERADO" ||
      !metadata.para ||
      !(metadata.para in ESTAGIO_NEGOCIACAO_LABEL)
    ) {
      return [];
    }
    return [
      {
        negociacaoId: atividade.negociacaoId,
        etapa: metadata.para as EtapaAlcancada["etapa"],
      },
    ];
  });

  return analisarInteligencia({
    agora,
    periodo: periodoInteligencia(filtros, agora),
    perfil: filtros.perfilCliente,
    negociacoes,
    leads,
    propostas,
    contratosHistoricos,
    etapasAlcancadas,
  });
}
