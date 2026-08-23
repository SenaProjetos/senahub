import type { EstagioNegociacao } from "@/generated/prisma/client";
import {
  conversaoEntreEtapas,
  conversaoPontaAPonta,
  descontoMedio,
  pipelineAberto,
  pipelinePonderado,
  taxaRecompra,
  tempoMedioFechamento,
  ticketMedioPorContrato,
  valorContratado,
  type EtapaAlcancada,
  type LinhaNegociacao,
  type LinhaVersaoProposta,
  type Periodo,
} from "@/modules/comercial/metricas";
import type { PerfilCliente } from "@/modules/comercial/inteligencia/filtros";

export type DimensaoAnalitica = { id: string | null; nome: string };

export type NegociacaoAnalitica = LinhaNegociacao & {
  canal: DimensaoAnalitica;
  campanha: DimensaoAnalitica;
  tipoEmpreendimento: DimensaoAnalitica;
  disciplinas: DimensaoAnalitica[];
};

export type LeadAnalitico = {
  id: string;
  criadoEm: Date;
  empresaId: string;
  canal: DimensaoAnalitica;
  campanha: DimensaoAnalitica;
};

export type PropostaAnalitica = {
  id: string;
  negociacaoId: string | null;
  enviadaEm: Date | null;
  versao: LinhaVersaoProposta | null;
  itens: { disciplinaId: string | null; valor: number }[];
};

export type ContratoHistorico = {
  id: string;
  empresaId: string;
  dataFechamento: Date;
  valorNegociado: number | null;
};

export type LinhaOrigem = {
  chave: string;
  nome: string;
  prospeccoes: number;
  negociacoes: number;
  propostas: number;
  contratos: number;
  conversao: number | null;
  receita: number;
  ticketMedio: number | null;
  tempoMedioDias: number | null;
};

export type LinhaCategoria = {
  chave: string;
  nome: string;
  negociacoes: number;
  contratos: number;
  receita: number;
  ticketMedio: number | null;
  descontoMedio: number | null;
};

export const ETAPAS_FUNIL_ANALITICO: readonly EstagioNegociacao[] = [
  "LEVANTAMENTO",
  "ORCAMENTO",
  "PROPOSTA_ENVIADA",
  "NEGOCIACAO",
  "CONTRATADO",
] as const;

function dentro(data: Date | null, periodo: Periodo): boolean {
  return (
    data != null &&
    data.getTime() >= periodo.inicio.getTime() &&
    data.getTime() < periodo.fim.getTime()
  );
}

function primeiroContratoPorEmpresa(contratos: readonly ContratoHistorico[]) {
  const mapa = new Map<string, ContratoHistorico>();
  for (const contrato of [...contratos].sort(
    (a, b) => a.dataFechamento.getTime() - b.dataFechamento.getTime(),
  )) {
    if (!mapa.has(contrato.empresaId)) mapa.set(contrato.empresaId, contrato);
  }
  return mapa;
}

function ehRecorrente(
  empresaId: string,
  data: Date,
  primeiros: ReadonlyMap<string, ContratoHistorico>,
  contratoId?: string,
): boolean {
  const primeiro = primeiros.get(empresaId);
  if (!primeiro) return false;
  if (contratoId === primeiro.id) return false;
  return primeiro.dataFechamento.getTime() <= data.getTime();
}

function combinaPerfil(ehClienteRecorrente: boolean, perfil: PerfilCliente | null): boolean {
  if (perfil == null) return true;
  return perfil === "recorrente" ? ehClienteRecorrente : !ehClienteRecorrente;
}

function filtrarPorPerfil(args: {
  perfil: PerfilCliente | null;
  negociacoes: readonly NegociacaoAnalitica[];
  leads: readonly LeadAnalitico[];
  propostas: readonly PropostaAnalitica[];
  contratosHistoricos: readonly ContratoHistorico[];
}) {
  const primeiros = primeiroContratoPorEmpresa(args.contratosHistoricos);
  const negociacoes = args.negociacoes.filter((n) =>
    combinaPerfil(
      ehRecorrente(n.empresaId, n.dataFechamento ?? n.criadoEm, primeiros, n.id),
      args.perfil,
    ),
  );
  const idsNegociacao = new Set(negociacoes.map((n) => n.id));
  return {
    negociacoes,
    leads: args.leads.filter((l) =>
      combinaPerfil(ehRecorrente(l.empresaId, l.criadoEm, primeiros), args.perfil),
    ),
    propostas:
      args.perfil == null
        ? [...args.propostas]
        : args.propostas.filter(
            (p) => p.negociacaoId != null && idsNegociacao.has(p.negociacaoId),
          ),
    primeiros,
  };
}

function analisarOrigem(
  negociacoes: readonly NegociacaoAnalitica[],
  leads: readonly LeadAnalitico[],
  propostas: readonly PropostaAnalitica[],
  periodo: Periodo,
  dimensaoNegociacao: (n: NegociacaoAnalitica) => DimensaoAnalitica,
  dimensaoLead: (l: LeadAnalitico) => DimensaoAnalitica,
): LinhaOrigem[] {
  const grupos = new Map<string, { chave: string; nome: string }>();
  for (const item of negociacoes.map(dimensaoNegociacao)) {
    grupos.set(item.id ?? "sem-informacao", {
      chave: item.id ?? "sem-informacao",
      nome: item.nome,
    });
  }
  for (const item of leads.map(dimensaoLead)) {
    grupos.set(item.id ?? "sem-informacao", {
      chave: item.id ?? "sem-informacao",
      nome: item.nome,
    });
  }

  const propostaPorNegociacao = new Map<string, PropostaAnalitica[]>();
  for (const proposta of propostas) {
    if (!proposta.negociacaoId) continue;
    const atuais = propostaPorNegociacao.get(proposta.negociacaoId) ?? [];
    atuais.push(proposta);
    propostaPorNegociacao.set(proposta.negociacaoId, atuais);
  }

  return [...grupos.values()]
    .map(({ chave, nome }) => {
      const nDoGrupo = negociacoes.filter(
        (n) => (dimensaoNegociacao(n).id ?? "sem-informacao") === chave,
      );
      const lDoGrupo = leads.filter((l) => (dimensaoLead(l).id ?? "sem-informacao") === chave);
      const propostasDoGrupo = nDoGrupo.flatMap(
        (n) => propostaPorNegociacao.get(n.id) ?? [],
      );
      const contratos = valorContratado(nDoGrupo, periodo);
      const conversao = conversaoPontaAPonta(
        lDoGrupo.filter((l) => dentro(l.criadoEm, periodo)),
        nDoGrupo,
      );
      return {
        chave,
        nome,
        prospeccoes: lDoGrupo.filter((l) => dentro(l.criadoEm, periodo)).length,
        negociacoes: nDoGrupo.filter((n) => dentro(n.criadoEm, periodo)).length,
        propostas: propostasDoGrupo.filter((p) => dentro(p.enviadaEm, periodo)).length,
        contratos: contratos.quantidade,
        conversao: conversao.taxa,
        receita: contratos.total,
        ticketMedio: ticketMedioPorContrato(nDoGrupo, periodo),
        tempoMedioDias: tempoMedioFechamento(nDoGrupo, periodo).media,
      };
    })
    .filter((linha) => linha.prospeccoes + linha.negociacoes + linha.propostas + linha.contratos > 0)
    .sort((a, b) => b.receita - a.receita || b.contratos - a.contratos || a.nome.localeCompare(b.nome));
}

function analisarCategoria(
  negociacoes: readonly NegociacaoAnalitica[],
  propostas: readonly PropostaAnalitica[],
  periodo: Periodo,
  dimensoes: (n: NegociacaoAnalitica) => readonly DimensaoAnalitica[],
): LinhaCategoria[] {
  const grupos = new Map<string, { chave: string; nome: string; negociacoes: NegociacaoAnalitica[] }>();
  for (const negociacao of negociacoes) {
    const itens = dimensoes(negociacao);
    for (const item of itens.length > 0 ? itens : [{ id: null, nome: "Não informado" }]) {
      const chave = item.id ?? "sem-informacao";
      const grupo = grupos.get(chave) ?? { chave, nome: item.nome, negociacoes: [] };
      grupo.negociacoes.push(negociacao);
      grupos.set(chave, grupo);
    }
  }

  const propostasPorNegociacao = new Map<string, PropostaAnalitica[]>();
  for (const proposta of propostas) {
    if (!proposta.negociacaoId) continue;
    const atuais = propostasPorNegociacao.get(proposta.negociacaoId) ?? [];
    atuais.push(proposta);
    propostasPorNegociacao.set(proposta.negociacaoId, atuais);
  }

  return [...grupos.values()]
    .map((grupo) => {
      const contratos = valorContratado(grupo.negociacoes, periodo);
      const versoes = grupo.negociacoes
        .flatMap((n) => propostasPorNegociacao.get(n.id) ?? [])
        .map((p) => p.versao)
        .filter((v): v is LinhaVersaoProposta => v != null && dentro(v.criadoEm, periodo));
      return {
        chave: grupo.chave,
        nome: grupo.nome,
        negociacoes: grupo.negociacoes.filter((n) => dentro(n.criadoEm, periodo)).length,
        contratos: contratos.quantidade,
        receita: contratos.total,
        ticketMedio: ticketMedioPorContrato(grupo.negociacoes, periodo),
        descontoMedio: descontoMedio(versoes).ponderado,
      };
    })
    .filter((linha) => linha.negociacoes + linha.contratos > 0)
    .sort((a, b) => b.receita - a.receita || b.contratos - a.contratos || a.nome.localeCompare(b.nome));
}

function analisarDisciplinas(
  negociacoes: readonly NegociacaoAnalitica[],
  propostas: readonly PropostaAnalitica[],
  periodo: Periodo,
): LinhaCategoria[] {
  const propostasPorNegociacao = new Map<string, PropostaAnalitica[]>();
  for (const proposta of propostas) {
    if (!proposta.negociacaoId) continue;
    const atuais = propostasPorNegociacao.get(proposta.negociacaoId) ?? [];
    atuais.push(proposta);
    propostasPorNegociacao.set(proposta.negociacaoId, atuais);
  }
  const grupos = new Map<string, { chave: string; nome: string; negociacoes: NegociacaoAnalitica[] }>();
  for (const negociacao of negociacoes) {
    const disciplinas =
      negociacao.disciplinas.length > 0
        ? negociacao.disciplinas
        : [{ id: null, nome: "Não informado" }];
    for (const disciplina of disciplinas) {
      const chave = disciplina.id ?? "sem-informacao";
      const grupo = grupos.get(chave) ?? { chave, nome: disciplina.nome, negociacoes: [] };
      grupo.negociacoes.push(negociacao);
      grupos.set(chave, grupo);
    }
  }

  return [...grupos.values()]
    .map((grupo) => {
      const contratos = valorContratado(grupo.negociacoes, periodo);
      const versoesRateadas: LinhaVersaoProposta[] = [];
      for (const negociacao of grupo.negociacoes) {
        for (const proposta of propostasPorNegociacao.get(negociacao.id) ?? []) {
          if (!proposta.versao || !dentro(proposta.versao.criadoEm, periodo)) continue;
          const totalItens = proposta.itens.reduce((soma, item) => soma + Math.max(0, item.valor), 0);
          const valorDisciplina = proposta.itens
            .filter((item) => (item.disciplinaId ?? "sem-informacao") === grupo.chave)
            .reduce((soma, item) => soma + Math.max(0, item.valor), 0);
          if (totalItens <= 0 || valorDisciplina <= 0) continue;
          const proporcao = valorDisciplina / totalItens;
          versoesRateadas.push({
            valorOriginal: proposta.versao.valorOriginal * proporcao,
            desconto:
              proposta.versao.desconto == null
                ? null
                : proposta.versao.desconto * proporcao,
            criadoEm: proposta.versao.criadoEm,
          });
        }
      }
      return {
        chave: grupo.chave,
        nome: grupo.nome,
        negociacoes: grupo.negociacoes.filter((n) => dentro(n.criadoEm, periodo)).length,
        contratos: contratos.quantidade,
        receita: contratos.total,
        ticketMedio: ticketMedioPorContrato(grupo.negociacoes, periodo),
        descontoMedio: descontoMedio(versoesRateadas).ponderado,
      };
    })
    .filter((linha) => linha.negociacoes + linha.contratos > 0)
    .sort((a, b) => b.receita - a.receita || b.contratos - a.contratos || a.nome.localeCompare(b.nome));
}

function recompraDoRecorte(
  contratosHistoricos: readonly ContratoHistorico[],
  idsSelecionados: ReadonlySet<string>,
  periodo: Periodo,
  meses: number,
  agora: Date,
) {
  const primeiros = primeiroContratoPorEmpresa(contratosHistoricos);
  const empresasSelecionadas = new Set(
    [...primeiros.values()]
      .filter((contrato) => idsSelecionados.has(contrato.id))
      .map((contrato) => contrato.empresaId),
  );
  const linhas: LinhaNegociacao[] = contratosHistoricos
    .filter((contrato) => empresasSelecionadas.has(contrato.empresaId))
    .map((contrato) => ({
      id: contrato.id,
      estagio: "CONTRATADO",
      criadoEm: contrato.dataFechamento,
      dataFechamento: contrato.dataFechamento,
      previsaoFechamento: null,
      valorNegociado: contrato.valorNegociado,
      valorProposto: null,
      valorEstimado: null,
      probabilidade: 100,
      empresaId: contrato.empresaId,
      leadId: null,
    }));
  return taxaRecompra(linhas, periodo, meses, agora);
}

export function analisarInteligencia(args: {
  agora: Date;
  periodo: Periodo;
  perfil: PerfilCliente | null;
  negociacoes: readonly NegociacaoAnalitica[];
  leads: readonly LeadAnalitico[];
  propostas: readonly PropostaAnalitica[];
  contratosHistoricos: readonly ContratoHistorico[];
  etapasAlcancadas: readonly EtapaAlcancada[];
}) {
  const filtrado = filtrarPorPerfil(args);
  const { negociacoes, leads, propostas } = filtrado;
  const periodo = args.periodo;
  const contratos = valorContratado(negociacoes, periodo);
  const pipeline = pipelineAberto(negociacoes);
  const coorteNegociacoes = negociacoes.filter((n) => dentro(n.criadoEm, periodo));
  const idsCoorte = new Set(coorteNegociacoes.map((n) => n.id));
  const etapas = [
    ...coorteNegociacoes.map((n) => ({ negociacaoId: n.id, etapa: "LEVANTAMENTO" as const })),
    ...args.etapasAlcancadas.filter((e) => idsCoorte.has(e.negociacaoId)),
  ];
  const conversaoEtapas = conversaoEntreEtapas(coorteNegociacoes, etapas);
  const pontaAPonta = conversaoPontaAPonta(
    leads.filter((l) => dentro(l.criadoEm, periodo)),
    negociacoes,
  );
  const idsContratosSelecionados = new Set(
    negociacoes.filter((n) => n.estagio === "CONTRATADO").map((n) => n.id),
  );
  const primeiros = primeiroContratoPorEmpresa(args.contratosHistoricos);
  let contratosDeNovos = 0;
  let contratosDeRecorrentes = 0;
  let receitaNovos = 0;
  let receitaRecorrentes = 0;
  const empresasNoPeriodo = new Set<string>();
  for (const n of negociacoes) {
    if (n.estagio !== "CONTRATADO" || !dentro(n.dataFechamento, periodo)) continue;
    empresasNoPeriodo.add(n.empresaId);
    const recorrente = primeiros.get(n.empresaId)?.id !== n.id;
    if (recorrente) {
      contratosDeRecorrentes++;
      receitaRecorrentes += n.valorNegociado ?? 0;
    } else {
      contratosDeNovos++;
      receitaNovos += n.valorNegociado ?? 0;
    }
  }

  return {
    resumo: {
      prospeccoes: leads.filter((l) => dentro(l.criadoEm, periodo)).length,
      negociacoes: coorteNegociacoes.length,
      propostas: propostas.filter((p) => dentro(p.enviadaEm, periodo)).length,
      contratos: contratos.quantidade,
      receita: contratos.total,
      contratosSemValor: contratos.semValor,
      ticketMedio: ticketMedioPorContrato(negociacoes, periodo),
      pipelineAberto: pipeline.total,
      pipelineEmEspera: pipeline.emEspera,
      pipelineSemValor: pipeline.semValor,
      pipelinePonderado: pipelinePonderado(negociacoes),
      tempoFechamento: tempoMedioFechamento(negociacoes, periodo),
    },
    funil: {
      coorte: conversaoEtapas.coorte,
      etapas: ETAPAS_FUNIL_ANALITICO.map((etapa) => ({
        etapa,
        taxa: conversaoEtapas.taxas[etapa],
        quantidade:
          conversaoEtapas.taxas[etapa] == null
            ? 0
            : Math.round(conversaoEtapas.taxas[etapa]! * conversaoEtapas.coorte),
      })),
      pontaAPonta,
    },
    porCanal: analisarOrigem(
      negociacoes,
      leads,
      propostas,
      periodo,
      (n) => n.canal,
      (l) => l.canal,
    ),
    porCampanha: analisarOrigem(
      negociacoes,
      leads,
      propostas,
      periodo,
      (n) => n.campanha,
      (l) => l.campanha,
    ),
    porTipoEmpreendimento: analisarCategoria(
      negociacoes,
      propostas,
      periodo,
      (n) => [n.tipoEmpreendimento],
    ),
    porDisciplina: analisarDisciplinas(negociacoes, propostas, periodo),
    novosVsRecorrentes: {
      contratosDeNovos,
      contratosDeRecorrentes,
      receitaNovos,
      receitaRecorrentes,
      ticketPorEmpresa:
        empresasNoPeriodo.size === 0 ? null : contratos.total / empresasNoPeriodo.size,
      recompra6m: recompraDoRecorte(
        args.contratosHistoricos,
        idsContratosSelecionados,
        periodo,
        6,
        args.agora,
      ),
      recompra12m: recompraDoRecorte(
        args.contratosHistoricos,
        idsContratosSelecionados,
        periodo,
        12,
        args.agora,
      ),
      recompra24m: recompraDoRecorte(
        args.contratosHistoricos,
        idsContratosSelecionados,
        periodo,
        24,
        args.agora,
      ),
    },
  };
}

export type InteligenciaComercialDados = ReturnType<typeof analisarInteligencia>;
