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
import { carregarCompromissos } from "@/modules/financeiro/recorrencia/queries";
import { prisma } from "@/lib/prisma";
import { inicioDoDiaUtc } from "@/lib/data";
import { CadastrosView } from "@/components/financeiro/cadastros/cadastros-view";

import { NavFinanceiro } from "@/components/financeiro/nav-financeiro";
export const metadata: Metadata = { title: "Cadastros financeiros" };

export default async function CadastrosFinanceirosPage() {
  await requirePermission("financeiro", "gerir");

  const [categorias, centros, contas, formas, fornecedores, socios, usuarios, compromissos, caixinhas] = await Promise.all([
    listarCategorias(),
    listarCentros(),
    listarContasBancarias(),
    listarFormasPagamento(),
    listarFornecedores(),
    listarSocios(),
    usuariosParaSocio(),
    carregarCompromissos(),
    prisma.caixinha.findMany({ where: { ativo: true }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true } }),
  ]);

  return (
    <CadastrosView subnav={<NavFinanceiro />}
      categorias={categorias}
      centros={centros}
      contas={contas.map((c) => ({ ...c, saldoInicial: Number(c.saldoInicial) }))}
      formas={formas}
      fornecedores={fornecedores.map((f) => ({
        ...f,
        catalogo: f.catalogo.map((s) => ({
          id: s.id,
          descricao: s.descricao,
          valorReferencia: s.valorReferencia != null ? Number(s.valorReferencia) : null,
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
      compromissos={compromissos}
      caixinhas={caixinhas}
      mesAtual={inicioDoDiaUtc().toISOString().slice(0, 7)}
      hojeDia={inicioDoDiaUtc().toISOString().slice(8, 10)}
    />
  );
}
