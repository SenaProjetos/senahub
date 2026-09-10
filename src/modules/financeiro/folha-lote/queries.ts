import "server-only";
import { prisma } from "@/lib/prisma";
import { temValorPagavel } from "@/modules/financeiro/folha/service";

/** Lotes mensais de folha de projetistas, com resumo dos pagamentos vinculados. */
export async function listarFolhasProjetista() {
  const fs = await prisma.folhaProjetista.findMany({
    orderBy: [{ ano: "desc" }, { mes: "desc" }],
    include: { pagamentos: { select: { status: true, valor: true } } },
  });
  return fs.map((f) => {
    const qtd = f.pagamentos.length;
    const pagos = f.pagamentos.filter((p) => p.status === "pago").length;
    const pendentes = f.pagamentos.filter((p) => p.status === "pendente");
    // Linhas zeradas não entram em "Pagar lote" — a action as deixa pendentes.
    const semValor = pendentes.filter((p) => !temValorPagavel(p.valor)).length;
    return {
      semValor,
      pagaveis: pendentes.length - semValor,
      id: f.id,
      ano: f.ano,
      mes: f.mes,
      status: f.status,
      total: Number(f.total),
      qtd,
      pagos,
      todosPagos: qtd > 0 && pagos === qtd,
    };
  });
}
