import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  ABA_ALTERDATA,
  CABECALHO_ALTERDATA,
  CABECALHO_MODELO_ALTERDATA,
  FORMATOS_CONTABIL,
  LIMITE_COMPLEMENTO_ALTERDATA,
  complementoAlterdata,
  complementosCortados,
  linhasComContaRepetida,
  linhasDoAlterdata,
  linhasSemConta,
  MOTIVO_ALTERDATA_CONTA_REPETIDA,
  MOTIVO_ALTERDATA_SEM_CONTA,
  type LinhaExportada,
} from "@/modules/financeiro/contabil/arquivo";
import { planilhaAlterdata, planilhaGenerica } from "@/modules/financeiro/contabil/arquivo-xlsx";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs") as typeof import("exceljs");

const CHAVE = "35190312345678000195550010000033811000033812";

const linha = (p: Partial<LinhaExportada> = {}): LinhaExportada => ({
  data: "2026-09-12",
  debito: 3941,
  credito: 4235,
  debitoClassificacao: "1.1.1.02.0004",
  creditoClassificacao: "1.1.2.01.0080",
  valorCentavos: 45000_05,
  historico: "Recebimento: Parcela 1/3",
  documento: null,
  chaveNfe: null,
  centro: "01",
  subcentro: "01.007",
  lancamentoId: "l1",
  evento: "baixa",
  ...p,
});

/** Escreve e lê de volta, como o contador abriria o arquivo. */
async function idaEVolta(linhas: LinhaExportada[]) {
  const buf = (await planilhaAlterdata(linhas).xlsx.writeBuffer()) as ArrayBuffer;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb.worksheets[0];
}

describe("layout do contador (modelo-de-importacao-alterdata-lancamentos.xls)", () => {
  it("o formato novo está na lista dos aceitos", () => {
    expect(FORMATOS_CONTABIL).toEqual(["xlsx", "csv", "alterdata"]);
  });

  it("as 5 primeiras colunas e a aba são as do modelo dele; centro, projeto e chave vêm depois, à direita", () => {
    expect([...CABECALHO_MODELO_ALTERDATA]).toEqual(["debito", "credito", "data", "valor", "complemento historico"]);
    expect([...CABECALHO_ALTERDATA]).toEqual(["debito", "credito", "data", "valor", "complemento historico", "centro de custo", "projeto", "chave de acesso"]);
    expect(ABA_ALTERDATA).toBe("Planilha1");
  });

  it("a planilha lida de volta tem a aba, o cabeçalho e as 8 colunas", async () => {
    const ws = await idaEVolta([linha(), linha({ valorCentavos: 1518_00 })]);
    expect(ws.name).toBe("Planilha1");
    expect(ws.columnCount).toBe(8);
    expect(ws.rowCount).toBe(3);
    expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual([...CABECALHO_ALTERDATA]);
  });

  it("débito e crédito são a CLASSIFICAÇÃO em texto; data de verdade sem andar de dia; valor com centavos", async () => {
    const ws = await idaEVolta([linha({ data: "2026-01-12", valorCentavos: 1518_00, debitoClassificacao: "3.1.2.03.0008", creditoClassificacao: "1.1.1.02.0004" })]);
    const r = ws.getRow(2);
    expect(r.getCell(1).value).toBe("3.1.2.03.0008");
    expect(r.getCell(2).value).toBe("1.1.1.02.0004");
    expect(r.getCell(1).numFmt).toBe("@");
    const d = r.getCell(3).value as Date;
    expect(d).toBeInstanceOf(Date);
    expect(d.toISOString().slice(0, 10)).toBe("2026-01-12");
    expect(r.getCell(3).numFmt).toBe("dd/mm/yyyy");
    expect(r.getCell(4).value).toBe(1518);
    expect(r.getCell(4).numFmt).toBe("0.00");
  });

  it("centavos não se perdem na ida e volta", async () => {
    const ws = await idaEVolta([linha({ valorCentavos: 45000_05 }), linha({ valorCentavos: 7_05 }), linha({ valorCentavos: 1_00 })]);
    expect([2, 3, 4].map((n) => ws.getRow(n).getCell(4).value)).toEqual([45000.05, 7.05, 1]);
  });

  it("documento no complemento; a chave da NF-e vai na coluna própria, em texto (44 dígitos não viram notação científica)", async () => {
    const [l] = linhasDoAlterdata([linha({ documento: "NF 3381", chaveNfe: CHAVE })]);
    expect(l).toHaveLength(8);
    expect(l[4]).toBe("Recebimento: Parcela 1/3 - Doc. NF 3381");
    expect([l[5], l[6], l[7]]).toEqual(["01", "01.007", CHAVE]);
    const ws = await idaEVolta([linha({ chaveNfe: CHAVE })]);
    expect(ws.getRow(2).getCell(8).value).toBe(CHAVE);
    expect(ws.getRow(2).getCell(8).numFmt).toBe("@");
  });

  it("linha sem centro, projeto nem chave deixa as colunas extras em branco", async () => {
    const [l] = linhasDoAlterdata([linha({ centro: null, subcentro: null })]);
    expect([l[5], l[6], l[7]]).toEqual([null, null, null]);
    const ws = await idaEVolta([linha({ centro: null, subcentro: null })]);
    expect([6, 7, 8].map((c) => ws.getRow(2).getCell(c).value ?? null)).toEqual([null, null, null]);
  });

  describe("complemento em até 200 caracteres (limite do contador)", () => {
    it("cabe: histórico + documento, sem mexer", () => {
      expect(complementoAlterdata({ historico: "Aluguel", documento: null })).toBe("Aluguel");
      expect(complementoAlterdata({ historico: "Aluguel", documento: "Boleto 1022" })).toBe("Aluguel - Doc. Boleto 1022");
      expect(complementosCortados([{ historico: "Aluguel", documento: "Boleto 1022" }])).toBe(0);
    });

    it("exatamente 200: não corta", () => {
      const h = "x".repeat(LIMITE_COMPLEMENTO_ALTERDATA);
      expect(complementoAlterdata({ historico: h, documento: null })).toBe(h);
      expect(complementosCortados([{ historico: h, documento: null }])).toBe(0);
    });

    it("passou: encurta a DESCRIÇÃO com reticências e mantém o documento inteiro, em 200 exatos", () => {
      const c = complementoAlterdata({ historico: "a".repeat(300), documento: "NF 3381" });
      expect(c).toHaveLength(200);
      expect(c.endsWith("… - Doc. NF 3381")).toBe(true);
      expect(complementosCortados([{ historico: "a".repeat(300), documento: "NF 3381" }])).toBe(1);
    });

    it("documento sozinho passando do limite: corta em 200, nunca passa", () => {
      const c = complementoAlterdata({ historico: "Aluguel", documento: "9".repeat(250) });
      expect(c.length).toBe(200);
    });
  });

  it("recusa linha sem conta em vez de mandar em branco para o Alterdata (sem reduzido OU sem classificação)", () => {
    const ls = [linha(), linha({ debito: null }), linha({ creditoClassificacao: null })];
    expect(linhasSemConta(ls)).toBe(2);
    expect(() => linhasDoAlterdata(ls)).toThrow(MOTIVO_ALTERDATA_SEM_CONTA(2));
    expect(() => planilhaAlterdata(ls)).toThrow(/2 linhas estão sem conta contábil/);
    expect(MOTIVO_ALTERDATA_SEM_CONTA(1)).toMatch(/^1 linha está sem conta contábil/);
  });

  it("conta cuja classificação se repete no plano: conta as linhas e diz qual é", () => {
    const repetidas = new Set(["2.1.3.01.0003"]);
    const ls = [linha(), linha({ creditoClassificacao: "2.1.3.01.0003" }), linha({ debitoClassificacao: "2.1.3.01.0003", creditoClassificacao: "2.1.3.01.0003" })];
    expect(linhasComContaRepetida(ls, repetidas)).toBe(2);
    expect(linhasComContaRepetida(ls, new Set())).toBe(0);
    expect(MOTIVO_ALTERDATA_CONTA_REPETIDA(2, ["2.1.3.01.0003"])).toMatch(/^2 linhas usam conta cuja classificação \(2\.1\.3\.01\.0003\) se repete/);
  });

  it("mês sem linhas gera só o cabeçalho", async () => {
    const ws = await idaEVolta([]);
    expect(ws.rowCount).toBe(1);
  });

  it("o arquivo genérico continua com as 9 colunas, classificação nas contas e o centro de custo", async () => {
    const buf = (await planilhaGenerica([linha()]).xlsx.writeBuffer()) as ArrayBuffer;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    expect(ws.name).toBe("Lançamentos");
    expect(ws.columnCount).toBe(9);
    expect(ws.getRow(2).getCell(2).value).toBe("1.1.1.02.0004");
    expect(ws.getRow(2).getCell(8).value).toBe("01");
  });
});
