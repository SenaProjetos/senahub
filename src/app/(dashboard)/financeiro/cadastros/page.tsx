import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import {
  listarCategorias,
  listarCentros,
  listarContasBancarias,
  listarFormasPagamento,
  listarFornecedores,
  listarSocios,
  usuariosParaSocio,
} from "@/modules/financeiro/cadastros/queries";
import { CadastrosView } from "@/components/financeiro/cadastros/cadastros-view";

export const metadata: Metadata = { title: "Cadastros financeiros" };

export default async function CadastrosFinanceirosPage() {
  await requirePermission("financeiro", "gerir");

  const [categorias, centros, contas, formas, fornecedores, socios, usuarios] = await Promise.all([
    listarCategorias(),
    listarCentros(),
    listarContasBancarias(),
    listarFormasPagamento(),
    listarFornecedores(),
    listarSocios(),
    usuariosParaSocio(),
  ]);

  return (
    <CadastrosView
      categorias={categorias}
      centros={centros}
      contas={contas.map((c) => ({ ...c, saldoInicial: Number(c.saldoInicial) }))}
      formas={formas}
      fornecedores={fornecedores}
      socios={socios.map((s) => ({ id: s.id, nome: s.user.name, percentual: Number(s.percentual) }))}
      usuarios={usuarios}
    />
  );
}
