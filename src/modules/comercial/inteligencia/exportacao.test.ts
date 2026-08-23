import { describe, expect, it } from "vitest";
import { CABECALHO_CSV_INTELIGENCIA, linhasInteligenciaParaCsv } from "@/modules/comercial/inteligencia/exportacao";
import type { InteligenciaComercialDados } from "@/modules/comercial/inteligencia/analise";

const dados: InteligenciaComercialDados = {
  resumo: { prospeccoes: 4, negociacoes: 3, propostas: 2, contratos: 1, receita: 12000, contratosSemValor: 0, ticketMedio: 12000, pipelineAberto: 5000, pipelineEmEspera: 0, pipelineSemValor: 0, pipelinePonderado: 2500, tempoFechamento: { media: 10, mediana: 10, descartadas: 0 } },
  funil: { coorte: 3, etapas: [{ etapa: "LEVANTAMENTO", taxa: 1, quantidade: 3 }, { etapa: "ORCAMENTO", taxa: 2 / 3, quantidade: 2 }, { etapa: "PROPOSTA_ENVIADA", taxa: 1 / 3, quantidade: 1 }, { etapa: "NEGOCIACAO", taxa: 1 / 3, quantidade: 1 }, { etapa: "CONTRATADO", taxa: 1 / 3, quantidade: 1 }], pontaAPonta: { taxa: 0.25, prospeccoes: 4, contratos: 1, contratosSemProspeccao: 0 } },
  porCanal: [{ chave: "indicacao", nome: "Indicação", prospeccoes: 4, negociacoes: 3, propostas: 2, contratos: 1, conversao: 0.25, receita: 12000, ticketMedio: 12000, tempoMedioDias: 10 }],
  porCampanha: [],
  porTipoEmpreendimento: [],
  porDisciplina: [],
  novosVsRecorrentes: { contratosDeNovos: 1, contratosDeRecorrentes: 0, receitaNovos: 12000, receitaRecorrentes: 0, ticketPorEmpresa: 12000, recompra6m: { empresasCoorte: 1, recompraram: 0, taxa: 0, janelaAindaAberta: false }, recompra12m: { empresasCoorte: 1, recompraram: 0, taxa: 0, janelaAindaAberta: false }, recompra24m: { empresasCoorte: 1, recompraram: 0, taxa: 0, janelaAindaAberta: false } },
};

describe("linhasInteligenciaParaCsv", () => {
  it("projeta os mesmos totais e percentuais exibidos no recorte", () => {
    const linhas = linhasInteligenciaParaCsv(dados);
    expect(CABECALHO_CSV_INTELIGENCIA).toContain("Receita contratada");
    expect(linhas[0]).toEqual(["Métricas executivas", "Total do recorte", 4, 3, 2, 1, 12000, 12000, 25, 10, null]);
    expect(linhas.find((linha) => linha[0] === "Por canal")).toEqual(["Por canal", "Indicação", 4, 3, 2, 1, 12000, 12000, 25, 10, null]);
  });
});
