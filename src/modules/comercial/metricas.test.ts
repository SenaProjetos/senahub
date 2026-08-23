import { describe, expect, it } from "vitest";
import type { EstagioNegociacao } from "@/generated/prisma/client";
import {
  ESTAGIOS_PIPELINE_ABERTO,
  conversaoEntreEtapas,
  conversaoPontaAPonta,
  descontoMedio,
  forecast,
  novosVsRecorrentes,
  pipelineAberto,
  pipelinePonderado,
  taxaRecompra,
  tempoMedioFechamento,
  ticketMedioPorContrato,
  valorContratado,
  valorDaNegociacao,
  type LinhaNegociacao,
  type Periodo,
} from "./metricas";

/**
 * Todo número esperado aqui é calculado À MÃO no próprio teste (aceite da F6.3). Se um valor
 * esperado precisar da própria function para ser justificado, o teste não prova nada.
 */

const D = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

/** Negociação com defaults inertes — cada teste sobrescreve só o que a fórmula usa. */
function neg(over: Partial<LinhaNegociacao> & { id: string }): LinhaNegociacao {
  return {
    estagio: "ORCAMENTO",
    criadoEm: D("2026-01-01"),
    dataFechamento: null,
    previsaoFechamento: null,
    valorNegociado: null,
    valorProposto: null,
    valorEstimado: null,
    probabilidade: 0,
    empresaId: `emp-${over.id}`,
    leadId: null,
    ...over,
  };
}

const ANO_2026: Periodo = { inicio: D("2026-01-01"), fim: D("2027-01-01") };

describe("valorDaNegociacao — cascata do mais firme para o mais especulativo", () => {
  it("negociado ganha de proposto, que ganha de estimado", () => {
    expect(valorDaNegociacao(neg({ id: "a", valorNegociado: 3, valorProposto: 2, valorEstimado: 1 }))).toBe(3);
    expect(valorDaNegociacao(neg({ id: "b", valorProposto: 2, valorEstimado: 1 }))).toBe(2);
    expect(valorDaNegociacao(neg({ id: "c", valorEstimado: 1 }))).toBe(1);
  });

  it("sem nenhum dos três devolve null — NÃO zero", () => {
    // Negociação sem valor é item de trabalho ("alguém precisa estimar"), não negócio de R$ 0.
    expect(valorDaNegociacao(neg({ id: "d" }))).toBeNull();
  });

  it("zero explícito é um valor, não ausência", () => {
    expect(valorDaNegociacao(neg({ id: "e", valorNegociado: 0 }))).toBe(0);
  });
});

describe("pipelineAberto (§3.7 / §2.5)", () => {
  const linhas = [
    neg({ id: "1", estagio: "LEVANTAMENTO", valorEstimado: 1000 }),
    neg({ id: "2", estagio: "NEGOCIACAO", valorProposto: 2000 }),
    neg({ id: "3", estagio: "EM_ESPERA", valorEstimado: 500 }),
    neg({ id: "4", estagio: "CONTRATADO", valorNegociado: 9999 }), // fora: virou receita
    neg({ id: "5", estagio: "PERDIDO", valorEstimado: 8888 }), // fora
    neg({ id: "6", estagio: "CANCELADO", valorEstimado: 7777 }), // fora
    neg({ id: "7", estagio: "ORCAMENTO" }), // aberta, sem valor
  ];

  it("soma 1000 + 2000 + 500 = 3500, ignorando encerradas", () => {
    expect(pipelineAberto(linhas).total).toBe(3500);
  });

  it("EM_ESPERA ENTRA no total (ADR-12: pausar não é perder)", () => {
    // Sem EM_ESPERA o total seria 3000; com ele, 3500.
    expect(pipelineAberto(linhas).total).toBe(3500);
    expect(ESTAGIOS_PIPELINE_ABERTO).toContain("EM_ESPERA");
  });

  it("mas devolve a parcela em espera SEPARADA — pipeline parado não pode parecer saudável", () => {
    expect(pipelineAberto(linhas).emEspera).toBe(500);
  });

  it("conta as abertas sem valor em vez de tratá-las como zero", () => {
    expect(pipelineAberto(linhas).semValor).toBe(1);
  });

  it("lista vazia devolve zeros — aqui zero é a resposta certa, não ausência", () => {
    // Diferente de uma TAXA: somatório de nada é 0 de verdade.
    expect(pipelineAberto([])).toEqual({ total: 0, emEspera: 0, semValor: 0 });
  });
});

describe("pipelinePonderado (§3.8)", () => {
  it("Σ valor × probabilidade: 1000×20% + 2000×75% = 200 + 1500 = 1700", () => {
    const linhas = [
      neg({ id: "1", estagio: "LEVANTAMENTO", valorEstimado: 1000, probabilidade: 20 }),
      neg({ id: "2", estagio: "NEGOCIACAO", valorProposto: 2000, probabilidade: 75 }),
    ];
    expect(pipelinePonderado(linhas)).toBe(1700);
  });

  it("probabilidade 0 zera a linha sem removê-la — é legítimo, não caso especial", () => {
    const linhas = [neg({ id: "1", estagio: "ORCAMENTO", valorEstimado: 5000, probabilidade: 0 })];
    expect(pipelinePonderado(linhas)).toBe(0);
  });

  it("encerradas não entram nem com probabilidade alta", () => {
    const linhas = [neg({ id: "1", estagio: "PERDIDO", valorEstimado: 1000, probabilidade: 90 })];
    expect(pipelinePonderado(linhas)).toBe(0);
  });
});

describe("valorContratado e ticketMedioPorContrato (§3.6 / §3.9)", () => {
  const linhas = [
    neg({ id: "1", estagio: "CONTRATADO", dataFechamento: D("2026-03-10"), valorNegociado: 10000 }),
    neg({ id: "2", estagio: "CONTRATADO", dataFechamento: D("2026-06-20"), valorNegociado: 30000 }),
    neg({ id: "3", estagio: "CONTRATADO", dataFechamento: D("2026-07-01"), valorNegociado: null }),
    neg({ id: "4", estagio: "CONTRATADO", dataFechamento: D("2025-12-31"), valorNegociado: 99999 }),
  ];

  it("soma só o que fechou DENTRO do período: 10000 + 30000 = 40000", () => {
    expect(valorContratado(linhas, ANO_2026).total).toBe(40000);
  });

  it("contrato sem valor conta na quantidade, não na soma", () => {
    const r = valorContratado(linhas, ANO_2026);
    expect(r.quantidade).toBe(3);
    expect(r.semValor).toBe(1);
  });

  it("ticket médio divide por contratos COM valor: 40000 / 2 = 20000, não /3", () => {
    // Dividir por 3 daria 13.333 — média puxada para baixo por AUSÊNCIA de dado, não por
    // negócio pequeno. É o erro que a regra do §3.9 evita.
    expect(ticketMedioPorContrato(linhas, ANO_2026)).toBe(20000);
  });

  it("sem nenhum contrato com valor, ticket é null — nunca 0", () => {
    const soSemValor = [neg({ id: "x", estagio: "CONTRATADO", dataFechamento: D("2026-05-05") })];
    expect(ticketMedioPorContrato(soSemValor, ANO_2026)).toBeNull();
  });

  it("período é fechado no início e ABERTO no fim (§1.3)", () => {
    const naVirada = [
      neg({ id: "ini", estagio: "CONTRATADO", dataFechamento: ANO_2026.inicio, valorNegociado: 7 }),
      neg({ id: "fim", estagio: "CONTRATADO", dataFechamento: ANO_2026.fim, valorNegociado: 5000 }),
    ];
    // O do início entra, o do fim não — é o que impede buraco/duplicata na virada.
    expect(valorContratado(naVirada, ANO_2026).total).toBe(7);
  });
});

describe("conversaoEntreEtapas (§3.10 / §2.4)", () => {
  const coorte = [
    neg({ id: "n1", estagio: "CONTRATADO" }),
    neg({ id: "n2", estagio: "PERDIDO" }),
    neg({ id: "n3", estagio: "CANCELADO" }),
    neg({ id: "n4", estagio: "ORCAMENTO" }),
  ];

  // n1 percorreu tudo; n2 chegou a proposta e perdeu; n3 e n4 pararam no orçamento.
  const alcancadas = [
    { negociacaoId: "n1", etapa: "ORCAMENTO" as EstagioNegociacao },
    { negociacaoId: "n1", etapa: "PROPOSTA_ENVIADA" as EstagioNegociacao },
    { negociacaoId: "n1", etapa: "CONTRATADO" as EstagioNegociacao },
    { negociacaoId: "n2", etapa: "ORCAMENTO" as EstagioNegociacao },
    { negociacaoId: "n2", etapa: "PROPOSTA_ENVIADA" as EstagioNegociacao },
    { negociacaoId: "n3", etapa: "ORCAMENTO" as EstagioNegociacao },
    { negociacaoId: "n4", etapa: "ORCAMENTO" as EstagioNegociacao },
  ];

  it("canceladas e em espera ENTRAM no denominador (§2.4): coorte = 4", () => {
    // Tirá-las inflaria a taxa sem nada ter melhorado.
    expect(conversaoEntreEtapas(coorte, alcancadas).coorte).toBe(4);
  });

  it("4/4 alcançaram ORCAMENTO = 100%; 2/4 proposta = 50%; 1/4 contrato = 25%", () => {
    const { taxas } = conversaoEntreEtapas(coorte, alcancadas);
    expect(taxas.ORCAMENTO).toBe(1);
    expect(taxas.PROPOSTA_ENVIADA).toBe(0.5);
    expect(taxas.CONTRATADO).toBe(0.25);
  });

  it("'alcançou' não é 'está': a contratada conta TAMBÉM em proposta enviada", () => {
    // Ler só o estágio atual daria 1/4 em proposta (só a n2), subestimando a etapa.
    const { taxas } = conversaoEntreEtapas(coorte, alcancadas);
    expect(taxas.PROPOSTA_ENVIADA).toBe(0.5);
  });

  it("passar duas vezes pela mesma etapa conta UMA (voltou e avançou de novo)", () => {
    const repetido = [...alcancadas, { negociacaoId: "n1", etapa: "ORCAMENTO" as EstagioNegociacao }];
    expect(conversaoEntreEtapas(coorte, repetido).taxas.ORCAMENTO).toBe(1);
  });

  it("etapa alcançada por negociação FORA da coorte é ignorada", () => {
    const intruso = [...alcancadas, { negociacaoId: "outra", etapa: "CONTRATADO" as EstagioNegociacao }];
    expect(conversaoEntreEtapas(coorte, intruso).taxas.CONTRATADO).toBe(0.25);
  });

  it("coorte vazia devolve null em TODA etapa — não 0%", () => {
    const { taxas, coorte: n } = conversaoEntreEtapas([], alcancadas);
    expect(n).toBe(0);
    expect(taxas.CONTRATADO).toBeNull();
    expect(taxas.ORCAMENTO).toBeNull();
  });
});

describe("conversaoPontaAPonta (§3.11 / §2.9)", () => {
  const prospeccoes = [{ id: "l1" }, { id: "l2" }, { id: "l3" }, { id: "l4" }];

  it("2 de 4 prospecções viraram contrato = 50%", () => {
    const negs = [
      neg({ id: "n1", estagio: "CONTRATADO", leadId: "l1" }),
      neg({ id: "n2", estagio: "CONTRATADO", leadId: "l2" }),
      neg({ id: "n3", estagio: "PERDIDO", leadId: "l3" }),
    ];
    const r = conversaoPontaAPonta(prospeccoes, negs);
    expect(r.prospeccoes).toBe(4);
    expect(r.contratos).toBe(2);
    expect(r.taxa).toBe(0.5);
  });

  it("contrato SEM prospecção não entra na taxa, mas é reportado à parte (§2.9)", () => {
    const negs = [
      neg({ id: "n1", estagio: "CONTRATADO", leadId: "l1" }),
      neg({ id: "n2", estagio: "CONTRATADO", leadId: null }), // criada direto / sintética F5.2
    ];
    const r = conversaoPontaAPonta(prospeccoes, negs);
    // 1/4, não 2/4: somá-la ao numerador dividiria por um denominador que não a contém.
    expect(r.taxa).toBe(0.25);
    expect(r.contratosSemProspeccao).toBe(1);
  });

  it("duas negociações do MESMO lead contam uma prospecção convertida", () => {
    const negs = [
      neg({ id: "n1", estagio: "CONTRATADO", leadId: "l1" }),
      neg({ id: "n2", estagio: "CONTRATADO", leadId: "l1" }),
    ];
    expect(conversaoPontaAPonta(prospeccoes, negs).contratos).toBe(1);
  });

  it("coorte vazia devolve taxa null", () => {
    expect(conversaoPontaAPonta([], []).taxa).toBeNull();
  });
});

describe("tempoMedioFechamento (§3.12)", () => {
  it("média e mediana de 10, 20 e 30 dias = 20 e 20", () => {
    const negs = [
      neg({ id: "1", estagio: "CONTRATADO", criadoEm: D("2026-01-01"), dataFechamento: D("2026-01-11") }),
      neg({ id: "2", estagio: "CONTRATADO", criadoEm: D("2026-01-01"), dataFechamento: D("2026-01-21") }),
      neg({ id: "3", estagio: "CONTRATADO", criadoEm: D("2026-01-01"), dataFechamento: D("2026-01-31") }),
    ];
    const r = tempoMedioFechamento(negs, ANO_2026);
    expect(r.media).toBe(20);
    expect(r.mediana).toBe(20);
  });

  it("média e mediana DIVERGEM com cauda longa — é por isso que as duas são exibidas", () => {
    // 10, 20, 366 dias → média 132, mediana 20. Só a média esconderia que o típico é 20.
    const negs = [
      neg({ id: "1", estagio: "CONTRATADO", criadoEm: D("2026-01-01"), dataFechamento: D("2026-01-11") }),
      neg({ id: "2", estagio: "CONTRATADO", criadoEm: D("2026-01-01"), dataFechamento: D("2026-01-21") }),
      neg({ id: "3", estagio: "CONTRATADO", criadoEm: D("2026-01-01"), dataFechamento: D("2027-01-02") }),
    ];
    const r = tempoMedioFechamento(negs, ANO_2026);
    expect(r.media).toBe(132);
    expect(r.mediana).toBe(20);
  });

  it("mediana de conjunto PAR é a média dos dois centrais: 10 e 20 → 15", () => {
    const negs = [
      neg({ id: "1", estagio: "CONTRATADO", criadoEm: D("2026-01-01"), dataFechamento: D("2026-01-11") }),
      neg({ id: "2", estagio: "CONTRATADO", criadoEm: D("2026-01-01"), dataFechamento: D("2026-01-21") }),
    ];
    expect(tempoMedioFechamento(negs, ANO_2026).mediana).toBe(15);
  });

  it("duração NEGATIVA é descartada e contada, nunca somada (achado do dev, §3.12)", () => {
    const negs = [
      neg({ id: "ok", estagio: "CONTRATADO", criadoEm: D("2026-01-01"), dataFechamento: D("2026-01-11") }),
      neg({ id: "bug", estagio: "CONTRATADO", criadoEm: D("2026-06-01"), dataFechamento: D("2026-05-01") }),
    ];
    const r = tempoMedioFechamento(negs, ANO_2026);
    expect(r.media).toBe(10); // e não (10 + (-31))/2 = -10,5
    expect(r.descartadas).toBe(1);
  });

  it("as ainda ABERTAS não entram — 'ainda não fechou' não é 'fechou devagar'", () => {
    const negs = [
      neg({ id: "1", estagio: "CONTRATADO", criadoEm: D("2026-01-01"), dataFechamento: D("2026-01-11") }),
      neg({ id: "2", estagio: "NEGOCIACAO", criadoEm: D("2026-01-01") }),
    ];
    expect(tempoMedioFechamento(negs, ANO_2026).media).toBe(10);
  });

  it("sem nenhum fechamento válido devolve null, não 0", () => {
    expect(tempoMedioFechamento([], ANO_2026)).toEqual({ media: null, mediana: null, descartadas: 0 });
  });
});

describe("descontoMedio (§3.13 / §2.8)", () => {
  it("ponderado e simples DIVERGEM quando o desconto grande está na proposta pequena", () => {
    // A: 100.000 com 2.000 (2%) · B: 10.000 com 3.000 (30%)
    // Ponderado = 5.000 / 110.000 = 4,545…%  ·  Simples = (2% + 30%) / 2 = 16%
    const versoes = [
      { valorOriginal: 100000, desconto: 2000, criadoEm: D("2026-01-01") },
      { valorOriginal: 10000, desconto: 3000, criadoEm: D("2026-01-02") },
    ];
    const r = descontoMedio(versoes);
    expect(r.ponderado).toBeCloseTo(4.5454545, 5);
    expect(r.simples).toBe(16);
    // A divergência é o ponto: publicar só uma sem dizer qual confunde "quanto cedemos" com
    // "com que frequência cedemos".
    expect(r.ponderado).not.toBe(r.simples);
  });

  it("versão SEM desconto entra como 0 — não é excluída", () => {
    // Excluí-la mediria "desconto médio entre quem deu desconto", que é outra pergunta.
    // 1.000 / 11.000 = 9,0909…%
    const versoes = [
      { valorOriginal: 10000, desconto: 1000, criadoEm: D("2026-01-01") },
      { valorOriginal: 1000, desconto: null, criadoEm: D("2026-01-02") },
    ];
    expect(descontoMedio(versoes).ponderado).toBeCloseTo(9.0909, 3);
    expect(descontoMedio(versoes).simples).toBe(5); // (10% + 0%) / 2
  });

  it("valorOriginal zero ou negativo fica de fora (não há tabela sobre a qual calcular)", () => {
    const versoes = [
      { valorOriginal: 10000, desconto: 1000, criadoEm: D("2026-01-01") },
      { valorOriginal: 0, desconto: 500, criadoEm: D("2026-01-02") },
    ];
    expect(descontoMedio(versoes).ponderado).toBe(10);
  });

  it("nenhuma versão elegível devolve null nos dois", () => {
    expect(descontoMedio([])).toEqual({ ponderado: null, simples: null });
    expect(descontoMedio([{ valorOriginal: 0, desconto: 1, criadoEm: D("2026-01-01") }])).toEqual({
      ponderado: null,
      simples: null,
    });
  });
});

describe("novosVsRecorrentes (§3.14 / §2.3)", () => {
  it("classifica pelo 1º contrato da empresa, olhando TODO o histórico", () => {
    const negs = [
      // Empresa A fechou em 2025 (fora do período) e de novo em 2026 → o de 2026 é RECORRENTE.
      neg({ id: "a1", estagio: "CONTRATADO", empresaId: "A", dataFechamento: D("2025-06-01"), valorNegociado: 5000 }),
      neg({ id: "a2", estagio: "CONTRATADO", empresaId: "A", dataFechamento: D("2026-06-01"), valorNegociado: 8000 }),
      // Empresa B estreia em 2026 → NOVO.
      neg({ id: "b1", estagio: "CONTRATADO", empresaId: "B", dataFechamento: D("2026-03-01"), valorNegociado: 12000 }),
    ];
    const r = novosVsRecorrentes(negs, ANO_2026);
    // Janela retroativa INFINITA (§2.3): a de 2025 desqualifica A como "novo" em 2026.
    expect(r.contratosDeNovos).toBe(1);
    expect(r.contratosDeRecorrentes).toBe(1);
    expect(r.receitaNovos).toBe(12000);
    expect(r.receitaRecorrentes).toBe(8000);
  });

  it("ticket por EMPRESA ≠ ticket por contrato quando há recompra", () => {
    // Empresa A com 2 contratos de 10.000 no mesmo ano; empresa B com 1 de 20.000.
    // Por contrato: 40.000/3 = 13.333 · Por empresa: 40.000/2 = 20.000
    const negs = [
      neg({ id: "a1", estagio: "CONTRATADO", empresaId: "A", dataFechamento: D("2026-02-01"), valorNegociado: 10000 }),
      neg({ id: "a2", estagio: "CONTRATADO", empresaId: "A", dataFechamento: D("2026-08-01"), valorNegociado: 10000 }),
      neg({ id: "b1", estagio: "CONTRATADO", empresaId: "B", dataFechamento: D("2026-05-01"), valorNegociado: 20000 }),
    ];
    expect(novosVsRecorrentes(negs, ANO_2026).ticketPorEmpresa).toBe(20000);
    expect(ticketMedioPorContrato(negs, ANO_2026)).toBeCloseTo(13333.33, 1);
  });

  it("empresa já resolvida pela fusão não conta duas vezes (§1.2)", () => {
    // As duas linhas chegam com o MESMO empresaId porque a query resolveu a fusão antes.
    const negs = [
      neg({ id: "1", estagio: "CONTRATADO", empresaId: "sobrevivente", dataFechamento: D("2026-01-05"), valorNegociado: 100 }),
      neg({ id: "2", estagio: "CONTRATADO", empresaId: "sobrevivente", dataFechamento: D("2026-02-05"), valorNegociado: 100 }),
    ];
    const r = novosVsRecorrentes(negs, ANO_2026);
    expect(r.contratosDeNovos).toBe(1);
    expect(r.contratosDeRecorrentes).toBe(1);
    expect(r.ticketPorEmpresa).toBe(200); // 200 / 1 empresa
  });

  it("sem contratos no período, ticket por empresa é null", () => {
    expect(novosVsRecorrentes([], ANO_2026).ticketPorEmpresa).toBeNull();
  });
});

describe("taxaRecompra (§3.15)", () => {
  const coorte2024: Periodo = { inicio: D("2024-01-01"), fim: D("2025-01-01") };

  it("1 de 2 empresas recomprou dentro de 12 meses = 50%", () => {
    const negs = [
      neg({ id: "a1", estagio: "CONTRATADO", empresaId: "A", dataFechamento: D("2024-01-10") }),
      neg({ id: "a2", estagio: "CONTRATADO", empresaId: "A", dataFechamento: D("2024-09-10") }), // dentro
      neg({ id: "b1", estagio: "CONTRATADO", empresaId: "B", dataFechamento: D("2024-02-10") }),
    ];
    const r = taxaRecompra(negs, coorte2024, 12, D("2026-08-22"));
    expect(r.empresasCoorte).toBe(2);
    expect(r.recompraram).toBe(1);
    expect(r.taxa).toBe(0.5);
    expect(r.janelaAindaAberta).toBe(false);
  });

  it("recompra FORA da janela não conta", () => {
    const negs = [
      neg({ id: "a1", estagio: "CONTRATADO", empresaId: "A", dataFechamento: D("2024-01-10") }),
      neg({ id: "a2", estagio: "CONTRATADO", empresaId: "A", dataFechamento: D("2025-06-10") }), // 17 meses
    ];
    expect(taxaRecompra(negs, coorte2024, 12, D("2026-08-22")).recompraram).toBe(0);
    // Mas conta na janela de 24 meses:
    expect(taxaRecompra(negs, coorte2024, 24, D("2027-06-01")).recompraram).toBe(1);
  });

  it("janela AINDA ABERTA devolve taxa null — o erro clássico desta métrica", () => {
    // Coorte de 2026 com janela de 24 meses e 'agora' em 2026: a resposta não existe ainda.
    const negs = [neg({ id: "a1", estagio: "CONTRATADO", empresaId: "A", dataFechamento: D("2026-01-10") })];
    const r = taxaRecompra(negs, ANO_2026, 24, D("2026-08-22"));
    expect(r.janelaAindaAberta).toBe(true);
    expect(r.taxa).toBeNull(); // e NÃO 0% — "ainda não deu tempo" ≠ "ninguém recomprou"
    expect(r.empresasCoorte).toBe(1);
  });

  it("coorte vazia devolve null sem marcar janela aberta", () => {
    expect(taxaRecompra([], coorte2024, 12, D("2026-08-22"))).toEqual({
      empresasCoorte: 0,
      recompraram: 0,
      taxa: null,
      janelaAindaAberta: false,
    });
  });

  it("empresa cujo 1º contrato é anterior à coorte não entra na coorte", () => {
    const negs = [
      neg({ id: "a1", estagio: "CONTRATADO", empresaId: "A", dataFechamento: D("2023-05-01") }),
      neg({ id: "a2", estagio: "CONTRATADO", empresaId: "A", dataFechamento: D("2024-05-01") }),
    ];
    expect(taxaRecompra(negs, coorte2024, 12, D("2026-08-22")).empresasCoorte).toBe(0);
  });
});

describe("forecast (§3.18)", () => {
  it("soma o fechado com o ponderado das abertas COM previsão no horizonte", () => {
    const negs = [
      neg({ id: "f", estagio: "CONTRATADO", dataFechamento: D("2026-02-01"), valorNegociado: 50000 }),
      neg({ id: "a", estagio: "NEGOCIACAO", valorProposto: 20000, probabilidade: 75, previsaoFechamento: D("2026-09-01") }),
    ];
    const r = forecast(negs, ANO_2026);
    expect(r.fechado).toBe(50000);
    expect(r.esperadoDoAberto).toBe(15000); // 20.000 × 75%
    expect(r.total).toBe(65000);
  });

  it("aberta SEM previsão não vira palpite — vai para a fila de trabalho", () => {
    const negs = [
      neg({ id: "a", estagio: "ORCAMENTO", valorEstimado: 40000, probabilidade: 35, previsaoFechamento: null }),
    ];
    const r = forecast(negs, ANO_2026);
    expect(r.esperadoDoAberto).toBe(0);
    expect(r.ponderadoSemPrevisao).toBe(14000); // 40.000 × 35%
    expect(r.total).toBe(0);
  });

  it("previsão FORA do horizonte não entra nem no esperado nem no sem-previsão", () => {
    const negs = [
      neg({ id: "a", estagio: "NEGOCIACAO", valorProposto: 10000, probabilidade: 50, previsaoFechamento: D("2028-01-01") }),
    ];
    const r = forecast(negs, ANO_2026);
    expect(r.esperadoDoAberto).toBe(0);
    expect(r.ponderadoSemPrevisao).toBe(0);
  });

  it("encerradas não contaminam a parte aberta", () => {
    const negs = [
      neg({ id: "p", estagio: "PERDIDO", valorEstimado: 99999, probabilidade: 90, previsaoFechamento: D("2026-06-01") }),
    ];
    expect(forecast(negs, ANO_2026).total).toBe(0);
  });
});

describe("regra transversal: denominador zero devolve null, nunca 0 (§1.4)", () => {
  it("toda taxa/média de conjunto vazio é null", () => {
    // O contrato que a Fase 6 inteira depende: a tela distingue "não houve" de "houve e deu zero".
    expect(ticketMedioPorContrato([], ANO_2026)).toBeNull();
    expect(conversaoEntreEtapas([], []).taxas.CONTRATADO).toBeNull();
    expect(conversaoPontaAPonta([], []).taxa).toBeNull();
    expect(tempoMedioFechamento([], ANO_2026).media).toBeNull();
    expect(descontoMedio([]).ponderado).toBeNull();
    expect(novosVsRecorrentes([], ANO_2026).ticketPorEmpresa).toBeNull();
    expect(taxaRecompra([], ANO_2026, 12, D("2026-08-22")).taxa).toBeNull();
  });
});
