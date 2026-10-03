import { NextResponse } from "next/server";
import { createRequire } from "node:module";
import { diaDeSaoPaulo } from "@/lib/data";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { extratoDaConta } from "@/modules/financeiro/extrato/queries";

const require = createRequire(import.meta.url);
// exceljs é CommonJS — evita problema de default export no Turbopack.
const ExcelJS = require("exceljs") as typeof import("exceljs");

/** Extrato de uma conta no mês, em Excel (mock "Extrato por conta"). Mesmo gate da tela: `financeiro:ver`. */
export async function GET(req: Request) {
  await requirePermission("financeiro", "ver");
  const url = new URL(req.url);
  const contaId = url.searchParams.get("conta");
  const mesParam = url.searchParams.get("mes");
  const mes = mesParam && /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : diaDeSaoPaulo().slice(0, 7);
  if (!contaId || !(await prisma.contaBancaria.findUnique({ where: { id: contaId }, select: { id: true } }))) {
    return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
  }

  const { conta, extrato } = await extratoDaConta(contaId, mes);
  const reais = (c: number) => c / 100;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Extrato");
  ws.columns = [
    { header: "Data", key: "dia", width: 12 },
    { header: "Descrição", key: "descricao", width: 44 },
    { header: "Categoria", key: "categoria", width: 30 },
    { header: "Entrada", key: "entrada", width: 14 },
    { header: "Saída", key: "saida", width: 14 },
    { header: "Saldo", key: "saldo", width: 14 },
    { header: "Extrato do banco", key: "conciliado", width: 16 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.addRow({ descricao: "Saldo anterior", saldo: reais(extrato.saldoAnteriorCentavos) });
  for (const l of extrato.linhas) {
    ws.addRow({
      dia: l.dia.split("-").reverse().join("/"),
      descricao: l.descricao,
      categoria: l.categoria,
      entrada: l.efeitoCentavos > 0 ? reais(l.efeitoCentavos) : null,
      saida: l.efeitoCentavos < 0 ? reais(-l.efeitoCentavos) : null,
      saldo: reais(l.saldoCentavos),
      conciliado: l.conciliado ? "Conciliado" : "Falta conciliar",
    });
  }
  ws.addRow({});
  ws.addRow({
    descricao: "Total do período",
    entrada: reais(extrato.entradasCentavos),
    saida: reais(extrato.saidasCentavos),
    saldo: reais(extrato.saldoFinalCentavos),
  }).font = { bold: true };
  for (const col of ["entrada", "saida", "saldo"]) ws.getColumn(col).numFmt = '"R$" #,##0.00';

  const buffer = await wb.xlsx.writeBuffer();
  // Cabeçalho HTTP: só ASCII no nome do arquivo. NFD separa o acento da letra ("ç" → "c" + marca) e a marca sai.
  const nome = conta.nome.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Extrato_${nome}_${mes}.xlsx"`,
    },
  });
}
