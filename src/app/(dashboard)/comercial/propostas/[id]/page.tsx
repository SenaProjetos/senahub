import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { obterProposta } from "@/modules/comercial/queries";
import { listarTabelasPreco } from "@/modules/comercial/queries";
import { catalogoDisciplinas } from "@/modules/projetos/queries";
import { modelosPorFonte } from "@/modules/documentos/queries";
import { anexosDaProposta, versoesComparaveis } from "@/modules/comercial/propostas-extras/queries";
import { PropostaEditor } from "@/components/comercial/proposta-editor";
import { PropostaExtras } from "@/components/comercial/proposta-extras";

export const metadata: Metadata = { title: "Proposta" };

export default async function PropostaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("comercial", "ver");
  const podeGerir = await can(user.role, "comercial", "gerir");
  const { id } = await params;
  const [p, catalogo, tabelas, modelosDoc, anexos, versoesComp] = await Promise.all([
    obterProposta(id),
    catalogoDisciplinas(),
    listarTabelasPreco(),
    modelosPorFonte("proposta"),
    anexosDaProposta(id),
    versoesComparaveis(id),
  ]);
  if (!p) notFound();

  return (
    <div className="space-y-5">
    <PropostaEditor
      podeGerir={podeGerir}
      baseUrl={process.env.APP_URL ?? ""}
      modelosDoc={modelosDoc}
      proposta={{
        id: p.id,
        numero: p.numero,
        titulo: p.titulo,
        status: p.status,
        cliente: p.cliente.nome,
        areaM2: p.areaM2 != null ? Number(p.areaM2) : null,
        validade: p.validade ? p.validade.toISOString().slice(0, 10) : "",
        observacoes: p.observacoes ?? "",
        token: p.token,
        projetoId: p.projetoId,
        visualizacoes: p.visualizacoes.map((v) => v.createdAt.toISOString()),
        versoes: p.versoes.map((v) => ({ numero: v.numero, autor: v.autor.name, data: v.createdAt.toISOString() })),
        itens: p.itens.map((it) => ({
          disciplina: it.disciplina,
          descricao: it.descricao ?? "",
          valor: Number(it.valor),
        })),
        condicoes: p.condicoes.map((c) => ({
          descricao: c.descricao,
          tipo: c.tipo,
          valor: Number(c.valor),
        })),
      }}
      catalogo={catalogo.map((d) => d.nome)}
      tabelas={tabelas.map((t) => ({
        id: t.id,
        nome: t.nome,
        itens: t.itens.map((it) => ({ disciplina: it.disciplina, valorM2: Number(it.valorM2) })),
      }))}
    />
    <PropostaExtras propostaId={p.id} anexos={anexos} versoes={versoesComp} podeGerir={podeGerir} />
    </div>
  );
}
