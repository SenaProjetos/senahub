import { describe, expect, it } from "vitest";
import { inicioDoTempoDeCasa, remuneracaoContratual } from "./distribuicao";
import { avisosDoCusto } from "./avisos";

describe("inicioDoTempoDeCasa — recontratação", () => {
  it("desligado e recontratado no dia seguinte recomeça a contagem", () => {
    const vinculos = [
      { contratacao: "clt" as const, dataInicio: "2020-01-01", dataFim: "2025-12-31", motivoFim: "demissao_sem_justa_causa" },
      { contratacao: "clt" as const, dataInicio: "2026-01-01", dataFim: null, motivoFim: null },
    ];
    expect(inicioDoTempoDeCasa(vinculos, "clt", "2026-10-31")).toBe("2026-01-01");
  });
  it("vínculo substituído (troca de setor) continua emendando", () => {
    const vinculos = [
      { contratacao: "clt" as const, dataInicio: "2020-01-01", dataFim: "2025-12-31", motivoFim: "substituido" },
      { contratacao: "clt" as const, dataInicio: "2026-01-01", dataFim: null, motivoFim: null },
    ];
    expect(inicioDoTempoDeCasa(vinculos, "clt", "2026-10-31")).toBe("2020-01-01");
  });
});

describe("remuneracaoContratual", () => {
  const base = { contratacao: "clt" as const, inicioCasa: "2026-09-01", fimMes: "2026-10-31" };
  it("bolsa do estágio no histórico não vira salário do CLT efetivado", () => {
    expect(remuneracaoContratual({
      ...base,
      historico: [{ vigenciaEm: "2025-03-01", remuneracaoCent: 120000, contratacao: "estagio" }],
      vinculoRemuneracaoCent: 400000,
    })).toEqual({ cent: 400000, origem: "vinculo" });
  });
  it("reajuste do próprio CLT no histórico vale", () => {
    expect(remuneracaoContratual({
      ...base,
      historico: [
        { vigenciaEm: "2026-09-01", remuneracaoCent: 400000, contratacao: "clt" },
        { vigenciaEm: "2026-10-01", remuneracaoCent: 450000, contratacao: "clt" },
      ],
      vinculoRemuneracaoCent: 400000,
    })).toEqual({ cent: 450000, origem: "historico" });
  });
  it("histórico sem vínculo só conta a partir do início do tempo de casa", () => {
    expect(remuneracaoContratual({
      ...base,
      historico: [{ vigenciaEm: "2025-01-01", remuneracaoCent: 100000, contratacao: null }],
      vinculoRemuneracaoCent: null,
    })).toBeNull();
    expect(remuneracaoContratual({
      ...base,
      historico: [{ vigenciaEm: "2026-09-15", remuneracaoCent: 380000, contratacao: null }],
      vinculoRemuneracaoCent: null,
    })).toEqual({ cent: 380000, origem: "historico" });
  });
  it("reajuste depois do mês não conta", () => {
    expect(remuneracaoContratual({
      ...base,
      historico: [{ vigenciaEm: "2026-11-01", remuneracaoCent: 500000, contratacao: "clt" }],
      vinculoRemuneracaoCent: 400000,
    })).toEqual({ cent: 400000, origem: "vinculo" });
  });
});

describe("avisosDoCusto", () => {
  it("junta por motivo, com nome, e ignora quem está certo ou é PJ", () => {
    expect(avisosDoCusto([
      { nome: "Ana", contratacao: "clt", temCusto: false, semTabela: false, tabelaPosterior: false, origemBase: null },
      { nome: "Beto", contratacao: "estagio", temCusto: true, semTabela: true, tabelaPosterior: false, origemBase: "vinculo" },
      { nome: "Caio", contratacao: "clt", temCusto: true, semTabela: false, tabelaPosterior: false, origemBase: "historico" },
      { nome: "Davi", contratacao: "clt", temCusto: true, semTabela: false, tabelaPosterior: false, origemBase: "holerite" },
      { nome: "Eva", contratacao: "pj", temCusto: false, semTabela: false, tabelaPosterior: false, origemBase: null },
      { nome: "Fabi", contratacao: "pro_labore", temCusto: true, semTabela: false, tabelaPosterior: true, origemBase: "vinculo" },
    ])).toEqual([
      "Sem salário cadastrado, custo zero: Ana.",
      "Sem tabela de encargos para a contratação, custo só do salário: Beto.",
      "Tabela de encargos de um mês posterior usada no cálculo: Fabi.",
      "Sem holerite do mês, custo pelo cadastro: Beto, Caio.",
    ]);
  });
  it("sócio pelo cadastro é o normal e não gera aviso", () => {
    expect(avisosDoCusto([{ nome: "Sócio", contratacao: "pro_labore", temCusto: true, semTabela: false, tabelaPosterior: false, origemBase: "vinculo" }])).toEqual([]);
  });
});
