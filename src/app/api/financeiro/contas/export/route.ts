import { NextResponse } from "next/server";
import { createRequire } from "node:module";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { arquivoCsv, headersDownloadCsv, protegerFormulaPlanilha, type CelulaPlanilha } from "@/lib/export/csv";
import { formatarData } from "@/lib/utils";
import {
  dadosContas,
  dadosLivroCaixa,
  type LancamentoItem,
  type LivroCaixaItem,
} from "@/modules/financeiro/lancamentos/queries";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs") as typeof import("exceljs");

type Linha = {
  vencimento: string;
  descricao: string;
  categoria: string;
  contato: string;
  conta: string;
  centro: string;
  situacao: string;
  valor: number;
};

const COLUNAS = [
  { header: "Vencimento", key: "vencimento", width: 14 },
  { header: "Descrição", key: "descricao", width: 40 },
  { header: "Categoria", key: "categoria", width: 28 },
  { header: "Contato", key: "contato", width: 28 },
  { header: "Conta", key: "conta", width: 18 },
  { header: "Centro", key: "centro", width: 18 },
  { header: "Situação", key: "situacao", width: 14 },
  { header: "Valor", key: "valor", width: 16 },
] as const;

const exportSchema = z
  .object({
    formato: z.enum(["csv", "xlsx"]),
    tipo: z.enum(["livro_caixa", "contas_pagar", "contas_receber"]),
    ids: z.array(z.string().cuid()).max(5_000),
  })
  .strict();

const TITULO_POR_TIPO = {
  livro_caixa: "Lancamentos-de-caixa",
  contas_pagar: "Contas-a-pagar",
  contas_receber: "Contas-a-receber",
} as const;

function meioDia(data: Date) {
  const resultado = new Date(data);
  resultado.setHours(0, 0, 0, 0);
  return resultado;
}

function situacaoLivro(lancamento: LivroCaixaItem): string {
  if (lancamento.status === "cancelado") return "Cancelados";
  if (lancamento.status === "aguardando_aprovacao") return "Aguardando aprovação";
  if (lancamento.status === "confirmado") return lancamento.conciliado ? "Conciliados" : "Confirmados";
  const vencimento = lancamento.vencimento ?? lancamento.data;
  return meioDia(new Date(vencimento)) > meioDia(new Date()) ? "Agendados" : "Pendentes";
}

function situacaoConta(lancamento: LancamentoItem): string {
  if (lancamento.status === "aguardando_aprovacao") return "Aguardando aprovação";
  const vencimento = meioDia(new Date(lancamento.vencimento ?? lancamento.data));
  return vencimento <= meioDia(new Date()) ? "Pendente" : "Agendado";
}

function linhaDeLancamento(lancamento: LivroCaixaItem | LancamentoItem, situacao: string): Linha {
  return {
    vencimento: formatarData(lancamento.vencimento ?? lancamento.data),
    descricao: lancamento.descricao,
    categoria: `${lancamento.categoria?.codigo ?? ""} ${lancamento.categoria?.nome ?? ""}`.trim(),
    contato: lancamento.fornecedor?.nome ?? lancamento.cliente?.nome ?? "",
    conta: lancamento.conta?.nome ?? "",
    centro: lancamento.centro?.nome ?? "",
    situacao,
    valor: lancamento.tipo === "receita" ? Number(lancamento.valor) : -Number(lancamento.valor),
  };
}

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

  const { formato, tipo } = parsed.data;
  const ids = [...new Set(parsed.data.ids)];
  const itens = tipo === "livro_caixa" ? (await dadosLivroCaixa()).itens : await dadosContas();
  const porId = new Map(itens.map((item) => [item.id, item]));
  const linhas = ids.flatMap((id) => {
    const item = porId.get(id);
    if (!item) return [];
    if (tipo === "contas_pagar" && item.tipo !== "despesa") return [];
    if (tipo === "contas_receber" && item.tipo !== "receita") return [];
    return [
      linhaDeLancamento(
        item,
        tipo === "livro_caixa" ? situacaoLivro(item as LivroCaixaItem) : situacaoConta(item as LancamentoItem),
      ),
    ];
  });
  const titulo = TITULO_POR_TIPO[tipo];
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
  ws.getColumn("valor").numFmt = '#,##0.00;[Red]-#,##0.00';
  const total = linhas.reduce((soma, linha) => soma + linha.valor, 0);
  const totalRow = ws.addRow({ situacao: "TOTAL", valor: total });
  totalRow.font = { bold: true };

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${arquivo}"`,
    },
  });
}
