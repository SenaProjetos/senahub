import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
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
  const user = await requirePermission("financeiro", "gerir");
  const podeCotacao = await can(user.role, "custos", "cotacao");

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
      podeCotacao={podeCotacao}
      categorias={categorias}
      centros={centros}
      contas={contas.map((c) => ({ ...c, saldoInicial: Number(c.saldoInicial) }))}
      formas={formas}
      fornecedores={fornecedores.map((f) => ({
        ...f,
        avaliacaoNota: f.avaliacaoNota != null ? Number(f.avaliacaoNota) : null,
        catalogo: f.catalogo.map((s) => ({
          id: s.id,
          descricao: s.descricao,
          valorReferencia: s.valorReferencia != null ? Number(s.valorReferencia) : null,
        })),
        representantes: f.representantes.map((r) => ({
          id: r.id,
          nome: r.nome,
          cargo: r.cargo,
          telefone: r.telefone,
          email: r.email,
        })),
      }))}
      socios={socios.map((s) => ({
        id: s.id,
        nome: s.user.name,
        ativo: s.ativo,
        percentual: Number(s.percentual),
        retiradas: s.retiradas.map((r) => ({
          id: r.id,
          data: r.data.toISOString().slice(0, 10),
          valor: Number(r.valor),
          tipo: r.tipo,
          observacao: r.observacao,
        })),
      }))}
      usuarios={usuarios}
    />
  );
}
