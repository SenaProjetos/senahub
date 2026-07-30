import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { listarFornecedores } from "@/modules/custos/fornecedores/queries";
import { FornecedoresView } from "@/components/custos/fornecedores/fornecedores-view";

export const metadata: Metadata = { title: "Fornecedores — Engenharia de Custos" };

export default async function CustosFornecedoresPage() {
  await requirePermission("custos", "cotacao");

  const fornecedores = await listarFornecedores();

  return (
    <FornecedoresView
      fornecedores={fornecedores.map((f) => ({
        ...f,
        avaliacaoNota: f.avaliacaoNota != null ? Number(f.avaliacaoNota) : null,
        representantes: f.representantes.map((r) => ({
          id: r.id,
          nome: r.nome,
          cargo: r.cargo,
          telefone: r.telefone,
          email: r.email,
        })),
      }))}
    />
  );
}
