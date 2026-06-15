import "server-only";
import { prisma } from "@/lib/prisma";

/** Lotes mensais de folha de projetistas, com resumo dos pagamentos vinculados. */
export async function listarFolhasProjetista() {
  const fs = await prisma.folhaProjetista.findMany({
    orderBy: [{ ano: "desc" }, { mes: "desc" }],
    include: { pagamentos: { select: { status: true } } },
  });
  return fs.map((f) => {
    const qtd = f.pagamentos.length;
    const pagos = f.pagamentos.filter((p) => p.status === "pago").length;
    return {
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
