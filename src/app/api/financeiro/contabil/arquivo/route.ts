import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { csvDoArquivo, linhasSemConta, MOTIVO_ALTERDATA_SEM_CONTA } from "@/modules/financeiro/contabil/arquivo";
import { planilhaAlterdata, planilhaGenerica } from "@/modules/financeiro/contabil/arquivo-xlsx";
import type { LinhaContabil } from "@/modules/financeiro/contabil/partidas";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Baixa uma exportação contábil JÁ REGISTRADA (`exportarMesContabil` grava e audita; aqui só se lê o registro,
 * para o arquivo ser exatamente o que ficou guardado). Mesmo gate da tela: `financeiro:fechar`.
 */
export async function GET(req: Request) {
  await requirePermission("financeiro", "fechar");
  const id = new URL(req.url).searchParams.get("id");
  const e = id ? await prisma.exportacaoContabil.findUnique({ where: { id } }) : null;
  if (!e) return NextResponse.json({ error: "Exportação não encontrada." }, { status: 404 });
  const linhas = e.linhas as unknown as LinhaContabil[];
  const nome = `Contabil_${e.competencia}`;
  const baixar = (corpo: BodyInit, tipo: string, arquivo: string) =>
    new NextResponse(corpo, { headers: { "Content-Type": tipo, "Content-Disposition": `attachment; filename="${arquivo}"` } });

  if (e.formato === "csv") return baixar(csvDoArquivo(linhas), "text/csv; charset=utf-8", `${nome}.csv`);

  if (e.formato === "alterdata") {
    // O registro já foi barrado sem conta ao gravar; conferir de novo evita mandar ao contador uma linha que o Alterdata recusa.
    const faltam = linhasSemConta(linhas);
    if (faltam > 0) return NextResponse.json({ error: MOTIVO_ALTERDATA_SEM_CONTA(faltam) }, { status: 409 });
    return baixar((await planilhaAlterdata(linhas).xlsx.writeBuffer()) as ArrayBuffer, XLSX, `${nome}_layout-contador.xlsx`);
  }

  return baixar((await planilhaGenerica(linhas).xlsx.writeBuffer()) as ArrayBuffer, XLSX, `${nome}.xlsx`);
}
