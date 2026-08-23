import { describe, expect, it } from "vitest";
import { analisarInteligencia, type NegociacaoAnalitica } from "./analise";

const periodo = {
  inicio: new Date("2026-01-01T00:00:00.000Z"),
  fim: new Date("2027-01-01T00:00:00.000Z"),
};
const sem = { id: null, nome: "Não informado" };
const indicacao = { id: "canal-indicacao", nome: "Indicação" };
const evento = { id: "canal-evento", nome: "Evento" };
const campanha = { id: "camp-1", nome: "Campanha A" };
const tipo = { id: "tipo-1", nome: "Residencial" };
const disciplina = { id: "disc-1", nome: "Estrutural" };

function negociacao(
  parcial: Partial<NegociacaoAnalitica> & Pick<NegociacaoAnalitica, "id" | "empresaId">,
): NegociacaoAnalitica {
  const { id, empresaId, ...restante } = parcial;
  return {
    id,
    empresaId,
    estagio: "LEVANTAMENTO",
    criadoEm: new Date("2026-02-01T00:00:00.000Z"),
    dataFechamento: null,
    previsaoFechamento: null,
    valorNegociado: null,
    valorProposto: null,
    valorEstimado: 1_000,
    probabilidade: 20,
    leadId: null,
    canal: indicacao,
    campanha,
    tipoEmpreendimento: tipo,
    disciplinas: [disciplina],
    ...restante,
  };
}

describe("analisarInteligencia", () => {
  const primeiroAntigo = {
    id: "antigo-a",
    empresaId: "empresa-a",
    dataFechamento: new Date("2025-01-10T00:00:00.000Z"),
    valorNegociado: 500,
  };
  const recorrente = negociacao({
    id: "n-recorrente",
    empresaId: "empresa-a",
    estagio: "CONTRATADO",
    criadoEm: new Date("2026-02-01T00:00:00.000Z"),
    dataFechamento: new Date("2026-03-01T00:00:00.000Z"),
    valorNegociado: 2_000,
    leadId: "lead-a",
    probabilidade: 100,
  });
  const novo = negociacao({
    id: "n-novo",
    empresaId: "empresa-b",
    estagio: "CONTRATADO",
    criadoEm: new Date("2026-04-01T00:00:00.000Z"),
    dataFechamento: new Date("2026-05-01T00:00:00.000Z"),
    valorNegociado: 3_000,
    leadId: "lead-b",
    probabilidade: 100,
  });

  const base = {
    agora: new Date("2028-08-23T00:00:00.000Z"),
    periodo,
    perfil: null,
    negociacoes: [recorrente, novo],
    leads: [
      { id: "lead-a", criadoEm: new Date("2026-01-15T00:00:00.000Z"), empresaId: "empresa-a", canal: indicacao, campanha },
      { id: "lead-b", criadoEm: new Date("2026-03-15T00:00:00.000Z"), empresaId: "empresa-b", canal: indicacao, campanha },
      { id: "lead-sem-contrato", criadoEm: new Date("2026-06-01T00:00:00.000Z"), empresaId: "empresa-c", canal: evento, campanha: sem },
    ],
    propostas: [
      {
        id: "p-a",
        negociacaoId: "n-recorrente",
        enviadaEm: new Date("2026-02-15T00:00:00.000Z"),
        versao: { valorOriginal: 2_500, desconto: 500, criadoEm: new Date("2026-02-15T00:00:00.000Z") },
        itens: [{ disciplinaId: disciplina.id, valor: 2_500 }],
      },
      {
        id: "p-b",
        negociacaoId: "n-novo",
        enviadaEm: new Date("2026-04-15T00:00:00.000Z"),
        versao: { valorOriginal: 3_000, desconto: 0, criadoEm: new Date("2026-04-15T00:00:00.000Z") },
        itens: [{ disciplinaId: disciplina.id, valor: 3_000 }],
      },
    ],
    contratosHistoricos: [
      primeiroAntigo,
      { id: recorrente.id, empresaId: recorrente.empresaId, dataFechamento: recorrente.dataFechamento!, valorNegociado: recorrente.valorNegociado },
      { id: novo.id, empresaId: novo.empresaId, dataFechamento: novo.dataFechamento!, valorNegociado: novo.valorNegociado },
    ],
    etapasAlcancadas: [
      { negociacaoId: "n-recorrente", etapa: "ORCAMENTO" as const },
      { negociacaoId: "n-recorrente", etapa: "CONTRATADO" as const },
      { negociacaoId: "n-novo", etapa: "ORCAMENTO" as const },
      { negociacaoId: "n-novo", etapa: "CONTRATADO" as const },
    ],
  };

  it("separa novo de recorrente pelo primeiro contrato global, não pelo recorte", () => {
    const dados = analisarInteligencia(base);

    expect(dados.novosVsRecorrentes).toMatchObject({
      contratosDeNovos: 1,
      contratosDeRecorrentes: 1,
      receitaNovos: 3_000,
      receitaRecorrentes: 2_000,
      ticketPorEmpresa: 2_500,
    });
  });

  it("mantém canal com prospecção e zero contratos como conversão 0%, não ausência de dados", () => {
    const dados = analisarInteligencia(base);
    const linha = dados.porCanal.find((item) => item.chave === evento.id);

    expect(linha).toMatchObject({ prospeccoes: 1, negociacoes: 0, contratos: 0, conversao: 0 });
  });

  it("devolve conversão nula quando o recorte não possui prospecção", () => {
    const dados = analisarInteligencia({ ...base, leads: [] });

    expect(dados.funil.pontaAPonta.taxa).toBeNull();
  });

  it("o filtro recorrente exclui o primeiro contrato e preserva o contrato posterior", () => {
    const dados = analisarInteligencia({ ...base, perfil: "recorrente" });

    expect(dados.resumo.contratos).toBe(1);
    expect(dados.resumo.receita).toBe(2_000);
    expect(dados.novosVsRecorrentes.contratosDeRecorrentes).toBe(1);
  });
});
