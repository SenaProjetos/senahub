/**
 * Mapeador do SINAPI (workbook "Referência", planilhas ISD/ICD/ISE + Analítico) — PURO, sem
 * Prisma. Recebe worksheets já carregadas (quem lê o arquivo do disco/upload é o job/caller);
 * este módulo só normaliza células em listas tipadas. Layout fixo (não é sinônimo pt-BR como
 * `lib/import/mapeamento.ts` — aqui é relatório oficial de coluna estável), por isso não reusa
 * `lib/import/planilha.ts#lerPlanilha` (que assume 1 sheet, header na linha 1).
 *
 * Estrutura real (inspecionada com o arquivo do mês 06/2026, não suposta):
 * - ISD/ICD/ISE: header na linha 10, dados da 11 em diante. Colunas 1-5 = metadados do insumo,
 *   6-32 = preço por UF na ordem de `UF_ORDEM_SINAPI`. Célula de preço vazia = sem cotação.
 * - Analítico: header na linha 10, dados da 11 em diante. Linha com `Tipo Item` vazio = cabeçalho
 *   da composição (própria descrição/unidade nas colunas 5/6); linhas seguintes = itens (`Tipo
 *   Item` = INSUMO ou COMPOSICAO), até a próxima linha de cabeçalho.
 * - CSD/CCD/CSE (custo total por UF) e "Analítico com Custo" (planilha-modelo) **não são lidos**
 *   aqui — ver docs/superpowers/plans/2026-07-28-custos-c1-bancos.md §2.1.
 */
import "server-only";
import type ExcelJS from "exceljs";

export const UF_ORDEM_SINAPI = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE",
  "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;
export type UfSinapi = (typeof UF_ORDEM_SINAPI)[number];

export type RegimeSinapi = "sem_desoneracao" | "com_desoneracao" | "sem_encargos";

/** Nome da worksheet do workbook "Referência" para cada regime de encargos. */
export const SHEET_POR_REGIME: Record<RegimeSinapi, string> = {
  sem_desoneracao: "ISD",
  com_desoneracao: "ICD",
  sem_encargos: "ISE",
};

export const SHEET_ANALITICO = "Analítico";

const CATEGORIA_MAP: Record<string, string> = {
  "SERVIÇOS": "servicos",
  MATERIAL: "material",
  "MAO DE OBRA": "mao_de_obra",
  "ENCARGOS COMPLEMENTARES": "encargos_complementares",
  // Aquisição e locação viram a mesma categoria — a distinção fica no código/descrição do
  // insumo; não vale um 7º valor de enum só para isso.
  "EQUIPAMENTO (AQUISIÇÃO)": "equipamento",
  "EQUIPAMENTO (LOCAÇÃO)": "equipamento",
  ESPECIAIS: "especiais",
};

const PRIMEIRA_LINHA_DADOS = 11; // header ocupa a linha 10 em todas as sheets lidas aqui

function textoCelula(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    const o = v as { text?: unknown; result?: unknown; richText?: { text?: string }[] };
    if (typeof o.text === "string") return o.text.trim();
    if (typeof o.result === "string" || typeof o.result === "number") return String(o.result).trim();
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text ?? "").join("").trim();
  }
  return String(v).trim();
}

/** "06/2026" da célula "Mês de Referência" (linha 3) — presente em todas as sheets do Referência. */
export function lerMesReferencia(sheet: ExcelJS.Worksheet): string | null {
  const texto = textoCelula(sheet.getRow(3).getCell(2).value);
  return texto || null;
}

/**
 * Converte o metadado do SINAPI (normalmente "06/2026") para o primeiro dia do mês,
 * no formato aceito pelo input `date`. Tolera o rótulo junto do valor porque alguns
 * workbooks publicados trazem "Mês de Referência: 06/2026" na mesma célula.
 */
export function mesReferenciaParaDataBase(mesReferencia: string | null): string | null {
  if (!mesReferencia) return null;
  const match = mesReferencia.match(/\b(0?[1-9]|1[0-2])\s*[./-]\s*((?:19|20)\d{2})\b/);
  if (!match) return null;
  return `${match[2]}-${match[1].padStart(2, "0")}-01`;
}

export type InsumoLido = {
  codigo: string;
  descricao: string;
  unidade: string;
  categoria: string; // valor do enum CategoriaInsumo
  precosPorUf: Partial<Record<UfSinapi, number>>;
};

export type ResultadoLeituraInsumos = { ok: true; insumos: InsumoLido[] } | { ok: false; erro: string };

/** Lê uma sheet de insumos (ISD, ICD ou ISE) — mesmo layout nas 3. */
export function lerInsumosSinapi(sheet: ExcelJS.Worksheet): ResultadoLeituraInsumos {
  const insumos: InsumoLido[] = [];
  for (let r = PRIMEIRA_LINHA_DADOS; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const codigoRaw = row.getCell(2).value;
    if (codigoRaw == null || codigoRaw === "") continue;

    const classificacao = textoCelula(row.getCell(1).value);
    const categoria = CATEGORIA_MAP[classificacao];
    if (!categoria) {
      return {
        ok: false,
        erro: `Classificação de insumo desconhecida: "${classificacao}" (linha ${r}, código ${codigoRaw}).`,
      };
    }

    const precosPorUf: Partial<Record<UfSinapi, number>> = {};
    UF_ORDEM_SINAPI.forEach((uf, i) => {
      const v = row.getCell(6 + i).value;
      if (typeof v === "number") precosPorUf[uf] = v;
    });

    insumos.push({
      codigo: textoCelula(codigoRaw),
      descricao: textoCelula(row.getCell(3).value),
      unidade: textoCelula(row.getCell(4).value),
      categoria,
      precosPorUf,
    });
  }
  return { ok: true, insumos };
}

export type ComposicaoLida = { codigo: string; descricao: string; unidade: string; grupo: string | null };
export type ItemComposicaoLido = {
  composicaoCodigo: string;
  tipo: "insumo" | "composicao";
  itemCodigo: string;
  coeficiente: number;
};

export type ResultadoLeituraComposicoes =
  | { ok: true; composicoes: ComposicaoLida[]; itens: ItemComposicaoLido[] }
  | { ok: false; erro: string };

/** Lê a sheet "Analítico": composições (cabeçalho) + seus itens (INSUMO ou COMPOSICAO auxiliar). */
export function lerComposicoesSinapi(sheet: ExcelJS.Worksheet): ResultadoLeituraComposicoes {
  const composicoes: ComposicaoLida[] = [];
  const itens: ItemComposicaoLido[] = [];
  let composicaoAtual: string | null = null;

  for (let r = PRIMEIRA_LINHA_DADOS; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const codigoCompRaw = row.getCell(2).value;
    if (codigoCompRaw == null || codigoCompRaw === "") continue;
    const codigoComp = textoCelula(codigoCompRaw);

    const tipoItemTexto = textoCelula(row.getCell(3).value);

    if (!tipoItemTexto) {
      composicoes.push({
        codigo: codigoComp,
        descricao: textoCelula(row.getCell(5).value),
        unidade: textoCelula(row.getCell(6).value),
        grupo: textoCelula(row.getCell(1).value) || null,
      });
      composicaoAtual = codigoComp;
      continue;
    }

    if (composicaoAtual !== codigoComp) {
      return {
        ok: false,
        erro: `Item na linha ${r} referencia a composição "${codigoComp}" fora de ordem (sem cabeçalho anterior).`,
      };
    }
    const tipo = tipoItemTexto === "INSUMO" ? "insumo" : tipoItemTexto === "COMPOSICAO" ? "composicao" : null;
    if (!tipo) {
      return { ok: false, erro: `Tipo de item desconhecido "${tipoItemTexto}" na linha ${r} (composição ${codigoComp}).` };
    }
    const itemCodigoRaw = row.getCell(4).value;
    if (itemCodigoRaw == null || itemCodigoRaw === "") {
      return { ok: false, erro: `Item sem código na linha ${r} (composição ${codigoComp}).` };
    }
    const coefRaw = row.getCell(7).value;
    const coeficiente = typeof coefRaw === "number" ? coefRaw : Number(textoCelula(coefRaw));
    if (!Number.isFinite(coeficiente)) {
      return { ok: false, erro: `Coeficiente inválido na linha ${r} (composição ${codigoComp}).` };
    }

    itens.push({ composicaoCodigo: codigoComp, tipo, itemCodigo: textoCelula(itemCodigoRaw), coeficiente });
  }

  return { ok: true, composicoes, itens };
}
