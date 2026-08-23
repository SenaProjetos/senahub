import "server-only";
import { prisma } from "@/lib/prisma";
import { enviarPush } from "@/lib/push";
import { filtrarPorCategoria } from "@/modules/usuarios/preferencias/queries";
import { getConfigComercial } from "@/modules/comercial/config/queries";
import { paraParametrosRegras } from "@/modules/comercial/config/padroes";
import {
  avaliarRegras,
  type ContextoRegras,
  type LinhaClienteRegra,
  type LinhaFollowUp,
  type LinhaNegociacaoRegra,
  type LinhaPropostaRegra,
} from "@/modules/comercial/regras";
import {
  entregarPushBestEffort,
  persistirAutomacaoUmaVez,
} from "@/modules/comercial/automacoes-dedup";
import { Prisma, type EstagioNegociacao } from "@/generated/prisma/client";

const ESTAGIOS_VIVOS: readonly EstagioNegociacao[] = [
  "LEVANTAMENTO",
  "ORCAMENTO",
  "PROPOSTA_ENVIADA",
  "NEGOCIACAO",
] as const;

type UltimaInteracaoRow = { negociacaoId: string; createdAt: Date };
type MudancaEstagioRow = { negociacaoId: string; createdAt: Date; para: string | null };

/**
 * Carrega o contexto inteiro das seis regras com consultas em lote. Nenhuma regra conhece Prisma
 * e nenhuma entidade provoca consulta própria; o custo permanece constante quando o volume cresce.
 */
export async function carregarContextoAutomacoesComerciais(hoje: Date): Promise<ContextoRegras> {
  const config = await getConfigComercial();
  const parametros = paraParametrosRegras(config);

  const [followUpsRaw, propostasRaw, negociacoesRaw, contratosAgrupados, contratosOrdenados] =
    await Promise.all([
      prisma.compromisso.findMany({
        where: {
          tipo: { not: null },
          concluidoEm: null,
          inicio: { lt: hoje },
          entidadeTipo: { in: ["LEAD", "NEGOCIACAO"] },
          entidadeId: { not: null },
        },
        select: {
          id: true,
          titulo: true,
          inicio: true,
          concluidoEm: true,
          criadorId: true,
          entidadeTipo: true,
          entidadeId: true,
        },
      }),
      prisma.proposta.findMany({
        where: { status: "enviada", validade: { not: null } },
        select: {
          id: true,
          numero: true,
          validade: true,
          status: true,
          autorId: true,
          negociacao: { select: { responsavelId: true } },
        },
      }),
      prisma.negociacao.findMany({
        where: { estagio: { in: [...ESTAGIOS_VIVOS] } },
        select: {
          id: true,
          titulo: true,
          estagio: true,
          responsavelId: true,
          clienteId: true,
          createdAt: true,
        },
      }),
      prisma.negociacao.groupBy({
        by: ["clienteId"],
        where: { estagio: "CONTRATADO", dataFechamento: { not: null } },
        _count: { _all: true },
        _max: { dataFechamento: true },
      }),
      prisma.negociacao.findMany({
        where: { estagio: "CONTRATADO", dataFechamento: { not: null } },
        orderBy: { dataFechamento: "desc" },
        select: { clienteId: true, responsavelId: true },
      }),
    ]);

  const leadIds = followUpsRaw
    .filter((item) => item.entidadeTipo === "LEAD")
    .map((item) => item.entidadeId!);
  const negociacaoIdsFollowUp = followUpsRaw
    .filter((item) => item.entidadeTipo === "NEGOCIACAO")
    .map((item) => item.entidadeId!);
  const negociacaoIds = negociacoesRaw.map((negociacao) => negociacao.id);
  const clienteIds = contratosAgrupados.map((contrato) => contrato.clienteId);

  const [donosLead, donosNegociacao, ultimasInteracoes, mudancasEstagio, clientes] =
    await Promise.all([
      leadIds.length
        ? prisma.lead.findMany({
            where: { id: { in: leadIds } },
            select: { id: true, responsavelId: true },
          })
        : Promise.resolve([]),
      negociacaoIdsFollowUp.length
        ? prisma.negociacao.findMany({
            where: { id: { in: negociacaoIdsFollowUp } },
            select: { id: true, responsavelId: true },
          })
        : Promise.resolve([]),
      negociacaoIds.length
        ? prisma.$queryRaw<UltimaInteracaoRow[]>(Prisma.sql`
            SELECT DISTINCT ON ("negociacaoId") "negociacaoId", "createdAt"
            FROM "atividade"
            WHERE "negociacaoId" IN (${Prisma.join(negociacaoIds)})
              AND "tipo" <> CAST(${"SISTEMA"} AS "TipoAtividade")
            ORDER BY "negociacaoId", "createdAt" DESC
          `)
        : Promise.resolve([]),
      negociacaoIds.length
        ? prisma.$queryRaw<MudancaEstagioRow[]>(Prisma.sql`
            SELECT "negociacaoId", "createdAt", "metadata"->>'para' AS "para"
            FROM "atividade"
            WHERE "negociacaoId" IN (${Prisma.join(negociacaoIds)})
              AND "tipo" = CAST(${"SISTEMA"} AS "TipoAtividade")
              AND "metadata"->>'evento' = 'ESTAGIO_ALTERADO'
            ORDER BY "negociacaoId", "createdAt" DESC
          `)
        : Promise.resolve([]),
      clienteIds.length
        ? prisma.cliente.findMany({
            where: { id: { in: clienteIds }, excluidoEm: null },
            select: { id: true, nome: true },
          })
        : Promise.resolve([]),
    ]);

  const donoLead = new Map(donosLead.map((lead) => [lead.id, lead.responsavelId]));
  const donoNegociacao = new Map(
    donosNegociacao.map((negociacao) => [negociacao.id, negociacao.responsavelId]),
  );
  const followUps: LinhaFollowUp[] = followUpsRaw.flatMap((item) => {
    if (!item.entidadeTipo || !item.entidadeId || item.entidadeTipo === "CLIENTE") return [];
    const dono =
      item.entidadeTipo === "LEAD"
        ? donoLead.get(item.entidadeId)
        : donoNegociacao.get(item.entidadeId);
    return [{
      id: item.id,
      titulo: item.titulo,
      inicio: item.inicio,
      concluidoEm: item.concluidoEm,
      responsavelId: dono ?? item.criadorId,
      entidadeTipo: item.entidadeTipo,
      entidadeId: item.entidadeId,
    }];
  });

  const propostas: LinhaPropostaRegra[] = propostasRaw.map((proposta) => ({
    id: proposta.id,
    numero: proposta.numero,
    validade: proposta.validade,
    status: proposta.status,
    // Propostas históricas podem não ter negociação; nesse caso, o autor é o único dono real.
    responsavelId: proposta.negociacao?.responsavelId ?? proposta.autorId,
  }));

  const ultimaInteracao = new Map(
    ultimasInteracoes.map((atividade) => [atividade.negociacaoId, atividade.createdAt]),
  );
  const estagioAtual = new Map(negociacoesRaw.map((negociacao) => [negociacao.id, negociacao.estagio]));
  const estagioDesde = new Map<string, Date>();
  for (const mudanca of mudancasEstagio) {
    if (
      !estagioDesde.has(mudanca.negociacaoId) &&
      mudanca.para === estagioAtual.get(mudanca.negociacaoId)
    ) {
      estagioDesde.set(mudanca.negociacaoId, mudanca.createdAt);
    }
  }
  const negociacoes: LinhaNegociacaoRegra[] = negociacoesRaw.map((negociacao) => ({
    id: negociacao.id,
    titulo: negociacao.titulo,
    estagio: negociacao.estagio,
    responsavelId: negociacao.responsavelId,
    ultimaInteracaoEm: ultimaInteracao.get(negociacao.id) ?? null,
    estagioDesde: estagioDesde.get(negociacao.id) ?? null,
    criadoEm: negociacao.createdAt,
  }));

  const abertos = new Set(negociacoesRaw.map((negociacao) => negociacao.clienteId));
  const responsavelUltimoContrato = new Map<string, string | null>();
  for (const contrato of contratosOrdenados) {
    if (!responsavelUltimoContrato.has(contrato.clienteId)) {
      responsavelUltimoContrato.set(contrato.clienteId, contrato.responsavelId);
    }
  }
  const nomeCliente = new Map(clientes.map((cliente) => [cliente.id, cliente.nome]));
  const clientesRegra: LinhaClienteRegra[] = contratosAgrupados.flatMap((contrato) => {
    const nome = nomeCliente.get(contrato.clienteId);
    if (!nome) return [];
    return [{
      id: contrato.clienteId,
      nome,
      ultimoContratoEm: contrato._max.dataFechamento,
      temNegociacaoAberta: abertos.has(contrato.clienteId),
      recorrente: contrato._count._all > 1,
      responsavelId: responsavelUltimoContrato.get(contrato.clienteId) ?? null,
    }];
  });

  return { hoje, parametros, followUps, propostas, negociacoes, clientes: clientesRegra };
}

export type ResultadoTickAutomacoes = {
  avaliadas: number;
  enviadas: number;
  duplicadas: number;
  semResponsavel: number;
  responsavelInativo: number;
  optOut: number;
  pushFalhou: number;
};

/** Motor único F7.3/F7.4. `contexto`/`push=false` são seams do smoke; o job usa dados reais. */
export async function executarAutomacoesComerciais(
  hoje: Date = new Date(),
  opcoes?: { contexto?: ContextoRegras; push?: boolean },
): Promise<ResultadoTickAutomacoes> {
  const contexto = opcoes?.contexto ?? (await carregarContextoAutomacoesComerciais(hoje));
  const ocorrencias = avaliarRegras(contexto);
  const responsaveis = [
    ...new Set(ocorrencias.flatMap((ocorrencia) => ocorrencia.responsavelId ?? [])),
  ];
  const ativos = new Set(
    (
      await prisma.user.findMany({
        where: { id: { in: responsaveis }, ativo: true },
        select: { id: true },
      })
    ).map((user) => user.id),
  );
  const permitidos = new Set(
    await filtrarPorCategoria([...ativos], "comercial"),
  );

  const resultado: ResultadoTickAutomacoes = {
    avaliadas: ocorrencias.length,
    enviadas: 0,
    duplicadas: 0,
    semResponsavel: 0,
    responsavelInativo: 0,
    optOut: 0,
    pushFalhou: 0,
  };

  for (const ocorrencia of ocorrencias) {
    if (!ocorrencia.responsavelId) {
      resultado.semResponsavel++;
      continue;
    }
    if (!ativos.has(ocorrencia.responsavelId)) {
      resultado.responsavelInativo++;
      continue;
    }
    if (!permitidos.has(ocorrencia.responsavelId)) {
      resultado.optOut++;
      continue;
    }

    const persistida = await persistirAutomacaoUmaVez(
      (operacao) => prisma.$transaction(async (tx) => operacao(tx)),
      ocorrencia.responsavelId,
      ocorrencia.chaveDedup,
      { titulo: ocorrencia.titulo, corpo: ocorrencia.corpo, href: ocorrencia.href },
    );
    if (!persistida.criado) {
      resultado.duplicadas++;
      continue;
    }

    resultado.enviadas++;
    if (opcoes?.push === false) continue;
    const pushOk = await entregarPushBestEffort(
      () =>
        enviarPush(ocorrencia.responsavelId!, {
          title: ocorrencia.titulo,
          body: ocorrencia.corpo,
          url: ocorrencia.href,
          tag: `automacao-comercial-${ocorrencia.chaveDedup}`,
        }),
      (erro) => {
        console.error(
          `[automacoes-comerciais] push falhou (${ocorrencia.responsavelId}/${ocorrencia.chaveDedup}):`,
          erro,
        );
      },
    );
    if (!pushOk) resultado.pushFalhou++;
  }

  return resultado;
}
