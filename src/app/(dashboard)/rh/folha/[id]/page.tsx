import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { obterFolha } from "@/modules/rh/folha/queries";
import { modelosPorFonte } from "@/modules/documentos/queries";
import { faixasPorTipo } from "@/modules/rh/encargos/queries";
import { FolhaDetalheView } from "@/components/rh/folha/folha-detalhe-view";

export const metadata: Metadata = { title: "Folha CLT" };

export default async function FolhaDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(...HR_ADMIN_ROLES);
  const { id } = await params;
  const [dados, modelosDoc, faixas] = await Promise.all([
    obterFolha(id),
    modelosPorFonte("holerite"),
    faixasPorTipo(),
  ]);
  if (!dados) notFound();

  const { folha, rubricas, elegiveis } = dados;
  return (
    <FolhaDetalheView
      modelosDoc={modelosDoc}
      faixasInss={faixas.inss}
      faixasIrrf={faixas.irrf}
      folha={{
        id: folha.id,
        ano: folha.ano,
        mes: folha.mes,
        status: folha.status,
        holerites: folha.holerites.map((h) => ({
          id: h.id,
          enviadoEm: h.enviadoEm ? h.enviadoEm.toISOString() : null,
          user: { id: h.user.id, name: h.user.name, role: h.user.role },
          itens: h.itens.map((it) => ({
            id: it.id,
            rubricaId: it.rubricaId,
            descricao: it.descricao,
            tipo: it.tipo,
            valor: Number(it.valor),
          })),
        })),
      }}
      rubricas={rubricas.map((r) => ({ id: r.id, nome: r.nome, tipo: r.tipo }))}
      elegiveis={elegiveis}
    />
  );
}
