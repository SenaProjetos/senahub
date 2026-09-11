import { NextResponse } from "next/server";
import { createRequire } from "node:module";
import { getSession } from "@/lib/session";
import { can, canRole } from "@/lib/permissions";
import { arquivoCsv, headersDownloadCsv, protegerFormulaPlanilha, type CelulaPlanilha } from "@/lib/export/csv";
import { formatarData } from "@/lib/utils";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { dadosFolhaExport } from "@/modules/financeiro/folha/queries";
import { nomeArquivoExport } from "@/modules/financeiro/folha/service";
import { STATUS_PAGAMENTO_LABEL, TIPO_PROFISSIONAL_LABEL } from "@/modules/financeiro/folha/status";

// exceljs é CommonJS — evita problema de default export no Turbopack (mesmo padrão de
// contas/export e patrimonio/export).
const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs") as typeof import("exceljs");

const COLUNAS = [
  { header: "Projetista", key: "projetista", width: 26 },
  { header: "Tipo", key: "tipo", width: 12 },
  { header: "Projeto", key: "projeto", width: 32 },
  { header: "Disciplina", key: "disciplina", width: 22 },
  { header: "Valor", key: "valor", width: 14 },
  { header: "Liberado em", key: "liberadoEm", width: 14 },
  { header: "Status", key: "status", width: 12 },
  { header: "Pago em", key: "pagoEm", width: 14 },
  { header: "Conta", key: "conta", width: 18 },
  { header: "Forma", key: "forma", width: 14 },
  { header: "Observação", key: "observacao", width: 32 },
] as const;

type Chave = (typeof COLUNAS)[number]["key"];
type Linha = Record<Chave, CelulaPlanilha>;

type ItemExport = Awaited<ReturnType<typeof dadosFolhaExport>>["itens"][number];

function linhaDe(item: ItemExport): Linha {
  return {
    projetista: item.projetista.name,
    tipo: TIPO_PROFISSIONAL_LABEL[item.tipoProfissional] ?? item.tipoProfissional,
    projeto: `${formatarCodigo(item.disciplina.projeto.codigo)} · ${item.disciplina.projeto.nome}`,
    disciplina: item.disciplina.disciplinaTextoLegado,
    valor: item.valor,
    liberadoEm: formatarData(item.liberadoEm),
    status: STATUS_PAGAMENTO_LABEL[item.status] ?? item.status,
    pagoEm: item.pagoEm ? formatarData(item.pagoEm) : "",
    // Mesma leitura de `CelulaPagamento` (D24): sem lançamento, sem conta/forma pra mostrar.
    conta: item.lancamento?.conta ?? "",
    forma: item.lancamento?.forma ?? "",
    observacao: item.observacao ?? "",
  };
}

function valoresDaLinha(linha: Linha): CelulaPlanilha[] {
  return COLUNAS.map(({ key }) => linha[key]);
}

/**
 * Exporta a folha de produção respeitando os filtros ativos (status/projetista/projeto/
 * período/busca) e a ordenação da tabela — GET com os mesmos search params da tela, só com
 * `?formato=` a mais. Espelha `contas/export`: mesmas colunas de valor/planilha, mesmo par
 * CSV/XLSX; aqui é GET (não POST+ids) porque o recorte já é o filtro da URL, não uma
 * seleção de linhas — não existe "lista carregada no cliente" pra tirar ids dela.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  // Mesmo gate da página (`requirePermission`, `lib/session.ts:131`), que essa rota não pode
  // usar direto — ele redireciona em vez de devolver JSON. Sem o piso de sócio, um sócio que
  // ABRE a tela levaria 403 no botão de exportar que está bem ali na barra de filtros.
  const autorizado =
    (await can(session.user, "financeiro", "folha_pj")) ||
    (session.user.ehSocio && (await canRole("supervisor", "financeiro", "folha_pj")));
  if (!autorizado) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const formato = sp.formato === "xlsx" ? "xlsx" : "csv";
  const { itens, total: totalDoRecorte, truncado, filtros } = await dadosFolhaExport(sp);
  const linhas = itens.map(linhaDe);
  // Inclui o filtro no nome (F9/D28) — sem isso, dois exports com filtro diferente viram
  // "Producao.xlsx", "Producao (1).xlsx"... no histórico de downloads, sem dizer qual é qual.
  const arquivo = nomeArquivoExport(filtros, formato);
  // Corte silencioso em 5.000 linhas seria a mesma classe de erro do D11: o arquivo
  // pareceria completo sem estar. Uma linha extra avisa em vez de esconder.
  const avisoTruncado = truncado
    ? `⚠ Mostrando ${itens.length} de ${totalDoRecorte} — refine o filtro para exportar o resto.`
    : null;

  if (formato === "csv") {
    const rodape = avisoTruncado ? [[avisoTruncado]] : [];
    return new NextResponse(
      arquivoCsv(COLUNAS.map((c) => c.header), [...linhas.map(valoresDaLinha), ...rodape]),
      { headers: headersDownloadCsv(arquivo) },
    );
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Produção");
  ws.columns = [...COLUNAS];
  ws.getRow(1).font = { bold: true };
  for (const linha of linhas) {
    ws.addRow(Object.fromEntries(COLUNAS.map(({ key }) => [key, protegerFormulaPlanilha(linha[key])])));
  }
  ws.getColumn("valor").numFmt = "#,##0.00";
  const total = linhas.reduce((soma, l) => soma + (typeof l.valor === "number" ? l.valor : 0), 0);
  const totalRow = ws.addRow({ status: "TOTAL", valor: total });
  totalRow.font = { bold: true };
  if (avisoTruncado) {
    const avisoRow = ws.addRow({ projetista: avisoTruncado });
    avisoRow.font = { italic: true, color: { argb: "FFB45309" } };
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${arquivo}"`,
    },
  });
}
