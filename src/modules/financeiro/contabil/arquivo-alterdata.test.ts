import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  ABA_ALTERDATA,
  CABECALHO_ALTERDATA,
  FORMATOS_CONTABIL,
  complementoAlterdata,
  linhasDoAlterdata,
  linhasSemConta,
  MOTIVO_ALTERDATA_SEM_CONTA,
} from "@/modules/financeiro/contabil/arquivo";
import { planilhaAlterdata, planilhaGenerica } from "@/modules/financeiro/contabil/arquivo-xlsx";
import type { LinhaContabil } from "@/modules/financeiro/contabil/partidas";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs") as typeof import("exceljs");

const linha = (p: Partial<LinhaContabil> = {}): LinhaContabil => ({
  data: "2026-09-12",
  debito: 3941,
  credito: 4235,
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
async function ida_e_volta(linhas: LinhaContabil[]) {
  const buf = (await planilhaAlterdata(linhas).xlsx.writeBuffer()) as ArrayBuffer;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb.worksheets[0];
}

describe("layout do contador (modelo-de-importacao-alterdata-lancamentos.xls)", () => {
  it("o formato novo está na lista dos aceitos", () => {
    expect(FORMATOS_CONTABIL).toEqual(["xlsx", "csv", "alterdata"]);
  });

  it("cabeçalho e aba iguais aos do modelo dele: 5 colunas, minúsculas, sem acento", () => {
    expect([...CABECALHO_ALTERDATA]).toEqual(["debito", "credito", "data", "valor", "complemento historico"]);
    expect(ABA_ALTERDATA).toBe("Planilha1");
  });

  it("a planilha lida de volta tem a aba, o cabeçalho e só 5 colunas", async () => {
    const ws = await ida_e_volta([linha(), linha({ debito: 11, credito: 22, valorCentavos: 1518_00 })]);
    expect(ws.name).toBe("Planilha1");
    expect(ws.columnCount).toBe(5);
    expect(ws.rowCount).toBe(3);
    expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual(["debito", "credito", "data", "valor", "complemento historico"]);
  });

  it("débito e crédito são números, a data é data de verdade (sem andar de dia) e o valor é número com centavos", async () => {
    const ws = await ida_e_volta([linha({ data: "2026-01-12", valorCentavos: 1518_00, debito: 47, credito: 2, historico: "BETRAS SERVIÇOS CONTÁBEIS LTDA" })]);
    const r = ws.getRow(2);
    expect(r.getCell(1).value).toBe(47);
    expect(r.getCell(2).value).toBe(2);
    const d = r.getCell(3).value as Date;
    expect(d).toBeInstanceOf(Date);
    expect(d.toISOString().slice(0, 10)).toBe("2026-01-12");
    expect(r.getCell(3).numFmt).toBe("dd/mm/yyyy");
    expect(r.getCell(4).value).toBe(1518);
    expect(r.getCell(4).numFmt).toBe("0.00");
    expect(r.getCell(5).value).toBe("BETRAS SERVIÇOS CONTÁBEIS LTDA");
  });

  it("centavos não se perdem na ida e volta", async () => {
    const ws = await ida_e_volta([linha({ valorCentavos: 45000_05 }), linha({ valorCentavos: 7_05 }), linha({ valorCentavos: 1_00 })]);
    expect([2, 3, 4].map((n) => ws.getRow(n).getCell(4).value)).toEqual([45000.05, 7.05, 1]);
  });

  it("centro de custo e subcentro ficam de fora; documento e chave da NF-e viajam no complemento", () => {
    const [l] = linhasDoAlterdata([linha({ documento: "NF 3381", chaveNfe: "3".repeat(44) })]);
    expect(l).toHaveLength(5);
    expect(l[4]).toBe(`Recebimento: Parcela 1/3 - Doc. NF 3381 - Chave ${"3".repeat(44)}`);
    expect(JSON.stringify(l)).not.toContain("01.007");
  });

  it("complemento: só o histórico quando não há documento nem chave", () => {
    expect(complementoAlterdata({ historico: "Aluguel", documento: null, chaveNfe: null })).toBe("Aluguel");
    expect(complementoAlterdata({ historico: "Aluguel", documento: "Boleto 1022", chaveNfe: null })).toBe("Aluguel - Doc. Boleto 1022");
  });

  it("recusa linha sem conta em vez de mandar em branco para o Alterdata", () => {
    const ls = [linha(), linha({ debito: null }), linha({ credito: null })];
    expect(linhasSemConta(ls)).toBe(2);
    expect(() => linhasDoAlterdata(ls)).toThrow(MOTIVO_ALTERDATA_SEM_CONTA(2));
    expect(() => planilhaAlterdata(ls)).toThrow(/2 linhas estão sem conta contábil/);
    expect(MOTIVO_ALTERDATA_SEM_CONTA(1)).toMatch(/^1 linha está sem conta contábil/);
  });

  it("mês sem linhas gera só o cabeçalho", async () => {
    const ws = await ida_e_volta([]);
    expect(ws.rowCount).toBe(1);
  });

  it("o arquivo genérico continua com as 9 colunas e o centro de custo", async () => {
    const buf = (await planilhaGenerica([linha()]).xlsx.writeBuffer()) as ArrayBuffer;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    expect(ws.name).toBe("Lançamentos");
    expect(ws.columnCount).toBe(9);
    expect(ws.getRow(2).getCell(8).value).toBe("01");
  });
});
