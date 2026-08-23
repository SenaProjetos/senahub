import type { InteligenciaComercialDados, LinhaCategoria, LinhaOrigem } from "@/modules/comercial/inteligencia/analise";
import type { Recompra } from "@/modules/comercial/metricas";
import { ESTAGIO_NEGOCIACAO_LABEL } from "@/modules/comercial/labels";

type LinhaCsv = (string | number | null)[];

export const CABECALHO_CSV_INTELIGENCIA = [
  "Seção",
  "Recorte",
  "Prospecções",
  "Negociações",
  "Propostas",
  "Contratos",
  "Receita contratada",
  "Ticket médio",
  "Conversão (%)",
  "Tempo médio de fechamento (dias)",
  "Desconto médio (%)",
];

function percentual(valor: number | null): number | null {
  return valor == null ? null : valor * 100;
}

function linhaOrigem(secao: string, linha: LinhaOrigem): LinhaCsv {
  return [
    secao,
    linha.nome,
    linha.prospeccoes,
    linha.negociacoes,
    linha.propostas,
    linha.contratos,
    linha.receita,
    linha.ticketMedio,
    percentual(linha.conversao),
    linha.tempoMedioDias,
    null,
  ];
}

function linhaCategoria(secao: string, linha: LinhaCategoria): LinhaCsv {
  return [
    secao,
    linha.nome,
    null,
    linha.negociacoes,
    null,
    linha.contratos,
    linha.receita,
    linha.ticketMedio,
    null,
    null,
    percentual(linha.descontoMedio),
  ];
}

/**
 * F6.9 — o CSV é projeção direta do DTO da tela. Assim a exportação não recalcula métricas nem
 * cria uma definição paralela de "recorte"; toda linha pode ser conferida na Inteligência.
 */
export function linhasInteligenciaParaCsv(dados: InteligenciaComercialDados): LinhaCsv[] {
  const { resumo, funil, novosVsRecorrentes } = dados;
  return [
    [
      "Métricas executivas",
      "Total do recorte",
      resumo.prospeccoes,
      resumo.negociacoes,
      resumo.propostas,
      resumo.contratos,
      resumo.receita,
      resumo.ticketMedio,
      percentual(funil.pontaAPonta.taxa),
      resumo.tempoFechamento.media,
      null,
    ],
    ...funil.etapas.map((etapa) => [
      "Funil de conversão",
      ESTAGIO_NEGOCIACAO_LABEL[etapa.etapa],
      null,
      etapa.quantidade,
      null,
      null,
      null,
      null,
      percentual(etapa.taxa),
      null,
      null,
    ]),
    ...dados.porCanal.map((linha) => linhaOrigem("Por canal", linha)),
    ...dados.porCampanha.map((linha) => linhaOrigem("Por campanha", linha)),
    ...dados.porTipoEmpreendimento.map((linha) => linhaCategoria("Por tipo de empreendimento", linha)),
    ...dados.porDisciplina.map((linha) => linhaCategoria("Por disciplina", linha)),
    [
      "Novos x recorrentes",
      "Clientes novos",
      null,
      null,
      null,
      novosVsRecorrentes.contratosDeNovos,
      novosVsRecorrentes.receitaNovos,
      novosVsRecorrentes.ticketPorEmpresa,
      null,
      null,
      null,
    ],
    [
      "Novos x recorrentes",
      "Clientes recorrentes",
      null,
      null,
      null,
      novosVsRecorrentes.contratosDeRecorrentes,
      novosVsRecorrentes.receitaRecorrentes,
      novosVsRecorrentes.ticketPorEmpresa,
      null,
      null,
      null,
    ],
    ...([
      ["Recompra em 6 meses", novosVsRecorrentes.recompra6m],
      ["Recompra em 12 meses", novosVsRecorrentes.recompra12m],
      ["Recompra em 24 meses", novosVsRecorrentes.recompra24m],
    ] as [string, Recompra][]).map(([rotulo, recompra]) => [
      "Novos x recorrentes",
      `${rotulo} (${recompra.empresasCoorte} empresas na coorte)`,
      null,
      null,
      null,
      recompra.recompraram,
      null,
      null,
      percentual(recompra.taxa),
      null,
      null,
    ]),
  ];
}
