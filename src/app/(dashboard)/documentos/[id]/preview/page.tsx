import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { obterModelo, opcoesParametros } from "@/modules/documentos/queries";
import { resolverFonte } from "@/modules/documentos/fontes";
import { fonteDef } from "@/modules/documentos/fontes-meta";
import { DocRender } from "@/components/documentos/doc-render";
import { PreviewBar } from "@/components/documentos/preview-bar";

export const metadata: Metadata = { title: "Preview do documento" };

export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  await requirePermission("documentos", "ver");
  const { id } = await params;
  const sp = await searchParams;

  const modelo = await obterModelo(id);
  if (!modelo) notFound();

  const def = fonteDef(modelo.fonte);
  const dados = def ? await resolverFonte(def.id, sp) : { escalar: {}, linhas: [] };
  const faltamParams = def ? def.params.some((p) => !sp[p.id]) : false;
  const opcoes = await opcoesParametros();

  return (
    <div className="space-y-4">
      <PreviewBar
        modeloId={modelo.id}
        nome={modelo.nome}
        fonte={def ? { id: def.id, label: def.label, params: def.params } : null}
        valores={sp}
        opcoes={{
          projeto: opcoes.projetos.map((p) => ({ id: p.id, label: `${p.codigo} · ${p.nome}` })),
          usuario: opcoes.usuarios.map((u) => ({ id: u.id, label: u.name })),
          proposta: opcoes.propostas.map((p) => ({ id: p.id, label: `${p.numero} · ${p.titulo}` })),
          cliente: opcoes.clientes.map((c) => ({ id: c.id, label: c.nome })),
          licitacao: opcoes.licitacoes.map((l) => ({ id: l.id, label: l.titulo })),
          holerite: opcoes.holerites.map((h) => ({
            id: h.id,
            label: `${h.user.name} · ${String(h.folha.mes).padStart(2, "0")}/${h.folha.ano}`,
          })),
        }}
      />

      {faltamParams ? (
        <p className="rounded-sm border bg-card p-6 text-center text-sm text-muted-foreground">
          Selecione os parâmetros da fonte de dados acima para visualizar com dados reais.
        </p>
      ) : (
        <div className="doc-print-area overflow-auto">
          <DocRender schema={modelo.schema} escalar={dados.escalar} linhas={dados.linhas} />
        </div>
      )}
    </div>
  );
}
