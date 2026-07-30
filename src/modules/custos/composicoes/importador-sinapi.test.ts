import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it, beforeAll } from "vitest";
import {
  lerInsumosSinapi,
  lerComposicoesSinapi,
  lerMesReferencia,
  mesReferenciaParaDataBase,
  UF_ORDEM_SINAPI,
} from "./importador-sinapi";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs") as typeof import("exceljs");

const FIXTURE = path.join(__dirname, "__fixtures__", "sinapi-referencia-amostra.xlsx");

let wb: InstanceType<typeof ExcelJS.Workbook>;

beforeAll(async () => {
  wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FIXTURE);
});

describe("lerMesReferencia", () => {
  it("lê o mês de referência da linha 3", () => {
    expect(lerMesReferencia(wb.getWorksheet("ISD")!)).toBe("06/2026");
  });

  it("converte o mês de referência para a data-base editável", () => {
    expect(mesReferenciaParaDataBase("06/2026")).toBe("2026-06-01");
    expect(mesReferenciaParaDataBase("Mês de Referência: 6-2026")).toBe("2026-06-01");
  });

  it("não inventa data-base quando o metadado é inválido", () => {
    expect(mesReferenciaParaDataBase(null)).toBeNull();
    expect(mesReferenciaParaDataBase("13/2026")).toBeNull();
    expect(mesReferenciaParaDataBase("junho de 2026")).toBeNull();
  });
});

describe("lerInsumosSinapi", () => {
  it("lê os 7 insumos com classificação, unidade e preços por UF", () => {
    const r = lerInsumosSinapi(wb.getWorksheet("ISD")!);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.insumos).toHaveLength(7);

    const abertura = r.insumos.find((i) => i.codigo === "45333")!;
    expect(abertura.categoria).toBe("servicos");
    expect(abertura.unidade).toBe("UN");
    expect(abertura.precosPorUf.MG).toBe(100);
    expect(abertura.precosPorUf.RN).toBe(50);
    expect(abertura.precosPorUf.PE).toBeUndefined(); // célula em branco = sem cotação, não é 0

    const material = r.insumos.find((i) => i.codigo === "11270")!;
    expect(material.categoria).toBe("material");

    const maoDeObra = r.insumos.find((i) => i.codigo === "88309")!;
    expect(maoDeObra.categoria).toBe("mao_de_obra");
    expect(maoDeObra.precosPorUf.RN).toBe(12);
  });

  it("as 2 variantes de EQUIPAMENTO (aquisição/locação) mapeiam pra mesma categoria", () => {
    const r = lerInsumosSinapi(wb.getWorksheet("ISD")!);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.insumos.find((i) => i.codigo === "70001")!.categoria).toBe("equipamento");
    expect(r.insumos.find((i) => i.codigo === "70002")!.categoria).toBe("equipamento");
  });

  it("cobre as 6 categorias do enum CategoriaInsumo", () => {
    const r = lerInsumosSinapi(wb.getWorksheet("ISD")!);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const categorias = new Set(r.insumos.map((i) => i.categoria));
    expect(categorias).toEqual(
      new Set(["servicos", "material", "mao_de_obra", "encargos_complementares", "equipamento", "especiais"]),
    );
  });

  it("nenhum código de UF fora de UF_ORDEM_SINAPI (27 estados)", () => {
    expect(UF_ORDEM_SINAPI).toHaveLength(27);
    expect(new Set(UF_ORDEM_SINAPI).size).toBe(27);
  });
});

describe("lerComposicoesSinapi", () => {
  it("lê as 2 composições e liga corretamente os itens (mistura INSUMO e COMPOSICAO auxiliar)", () => {
    const r = lerComposicoesSinapi(wb.getWorksheet("Analítico")!);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.composicoes).toHaveLength(2);
    const rampa = r.composicoes.find((c) => c.codigo === "99999")!;
    expect(rampa.descricao).toBe("RAMPA TESTE");
    expect(rampa.grupo).toBe("Acessibilidade");
    const servente = r.composicoes.find((c) => c.codigo === "88888")!;
    expect(servente.unidade).toBe("H");

    const itensRampa = r.itens.filter((i) => i.composicaoCodigo === "99999");
    expect(itensRampa).toHaveLength(2);
    expect(itensRampa.find((i) => i.tipo === "composicao")).toMatchObject({ itemCodigo: "88888", coeficiente: 1.5 });
    expect(itensRampa.find((i) => i.tipo === "insumo")).toMatchObject({ itemCodigo: "45333", coeficiente: 2 });

    const itensServente = r.itens.filter((i) => i.composicaoCodigo === "88888");
    expect(itensServente).toHaveLength(2);
    expect(itensServente.every((i) => i.tipo === "insumo")).toBe(true);
  });

  it("total de itens bate com as linhas da planilha (4 de item, 2 de cabeçalho, 6 no total)", () => {
    const r = lerComposicoesSinapi(wb.getWorksheet("Analítico")!);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.itens).toHaveLength(4);
  });
});
