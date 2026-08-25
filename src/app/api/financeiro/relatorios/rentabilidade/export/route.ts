import { NextResponse } from "next/server";
import { createRequire } from "node:module";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { arquivoCsv, headersDownloadCsv, protegerFormulaPlanilha, type CelulaPlanilha } from "@/lib/export/csv";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { rentabilidadePorProjeto } from "@/modules/financeiro/relatorios/queries";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs") as typeof import("exceljs");

type Linha = {
  codigo: string;
  projeto: string;
  cliente: string;
  receita: number;
  diretos: number;
  indireto: number;
  lucroLiquido: number;
  margemLiquida: number | null;
  roi: number | null;
};

const COLUNAS = [
  { header: "Código", key: "codigo", width: 12 },
  { header: "Projeto", key: "projeto", width: 36 },
  { header: "Cliente", key: "cliente", width: 28 },
  { header: "Receita", key: "receita", width: 16 },
  { header: "Custos diretos", key: "diretos", width: 16 },
  { header: "Indireto rateado", key: "indireto", width: 16 },
  { header: "Lucro líquido", key: "lucroLiquido", width: 16 },
  { header: "Margem líq. %", key: "margemLiquida", width: 14 },
  { header: "ROI %", key: "roi", width: 12 },
] as const;

const dataSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((valor) => {
    const data = new Date(`${valor}T00:00:00.000Z`);
    return Number.isFinite(data.getTime()) && data.toISOString().startsWith(valor);
  });

const exportSchema = z
  .object({
    formato: z.enum(["csv", "xlsx"]),
    de: dataSchema,
    ate: dataSchema,
    margem: z.number().finite(),
  })
  .strict();

function valoresDaLinha(linha: Linha): CelulaPlanilha[] {
  return COLUNAS.map(({ key }) => linha[key]);
}

function adicionarLinhaSegura(ws: import("exceljs").Worksheet, linha: Linha) {
  const valores = valoresDaLinha(linha).map(protegerFormulaPlanilha);
  ws.addRow(Object.fromEntries(COLUNAS.map(({ key }, indice) => [key, valores[indice]])));
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await can(session.user, "financeiro", "ver"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const parsed = exportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados de exportação inválidos." }, { status: 400 });

  const { formato, de, ate, margem } = parsed.data;
  const inicio = new Date(`${de}T00:00:00.000Z`);
  const fim = new Date(`${ate}T23:59:59.999Z`);
  if (inicio > fim) return NextResponse.json({ error: "O início do período deve vir antes do fim." }, { status: 400 });

  const dados = await rentabilidadePorProjeto(inicio, fim, margem);
  const linhas = dados.projetos.map((projeto) => ({
    codigo: formatarCodigo(projeto.codigo),
    projeto: projeto.nome,
    cliente: projeto.cliente ?? "",
    receita: projeto.receita,
    diretos: projeto.diretos,
    indireto: projeto.indiretoRateado,
    lucroLiquido: projeto.lucroLiquido,
    margemLiquida: projeto.margemLiquida,
    roi: projeto.roi,
  }));
  const titulo = `Rentabilidade_${dados.de}_${dados.ate}`;
  const arquivo = `${titulo}.${formato}`;

  if (formato === "csv") {
    return new NextResponse(arquivoCsv(COLUNAS.map((coluna) => coluna.header), linhas.map(valoresDaLinha)), {
      headers: headersDownloadCsv(arquivo),
    });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(titulo.slice(0, 28));
  ws.columns = [...COLUNAS];
  ws.getRow(1).font = { bold: true };
  for (const linha of linhas) adicionarLinhaSegura(ws, linha);
  for (const key of ["receita", "diretos", "indireto", "lucroLiquido"]) {
    ws.getColumn(key).numFmt = '#,##0.00;[Red]-#,##0.00';
  }
  const totais = linhas.reduce(
    (soma, linha) => ({
      receita: soma.receita + linha.receita,
      diretos: soma.diretos + linha.diretos,
      indireto: soma.indireto + linha.indireto,
      lucroLiquido: soma.lucroLiquido + linha.lucroLiquido,
    }),
    { receita: 0, diretos: 0, indireto: 0, lucroLiquido: 0 },
  );
  const totalRow = ws.addRow({ projeto: "TOTAL", ...totais });
  totalRow.font = { bold: true };

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${arquivo}"`,
    },
  });
}
