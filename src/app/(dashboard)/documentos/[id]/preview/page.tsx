import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { obterModelo, opcoesParametros } from "@/modules/documentos/queries";
import { resolverFonte, isFonteDataset, DATASET_PREFIX, type DadosResolvidos } from "@/modules/documentos/fontes";
import { podeVerFonte } from "@/modules/documentos/fontes-perm";
import { fonteDef } from "@/modules/documentos/fontes-meta";
import { colunasDoDataset } from "@/modules/documentos/dataset-queries";
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
  const user = await requirePermission("documentos", "ver");
  const { id } = await params;
  const sp = await searchParams;

  const modelo = await obterModelo(id);
  if (!modelo) notFound();

  const ehDataset = isFonteDataset(modelo.fonte);
  const def = fonteDef(modelo.fonte);

  // CRÍTICO (segurança): bloqueia a resolução de uma fonte de sistema que o
  // viewer não pode ver — assim ninguém gera doc de "lancamentos"/"dre" etc.
  // só pela URL. Datasets de CSV não passam por esse gate (sem dados de módulo).
  const fonteBloqueada = !ehDataset && !(await podeVerFonte(user.role, modelo.fonte));

  // Dataset: a coleção é fixa (sem params). Fontes de sistema: resolve por def.
  const dados: DadosResolvidos = fonteBloqueada
    ? { escalar: {}, linhas: [] }
    : ehDataset
      ? await resolverFonte(modelo.fonte!, {})
      : def
        ? await resolverFonte(def.id, sp)
        : { escalar: {}, linhas: [] };
  const faltamParams = !fonteBloqueada && !ehDataset && def ? def.params.some((p) => !sp[p.id]) : false;
  const opcoes = await opcoesParametros();

  // Para o PreviewBar: datasets aparecem sem params (coleção fixa).
  const datasetColunas = ehDataset
    ? await colunasDoDataset(modelo.fonte!.slice(DATASET_PREFIX.length))
    : [];
  const fonteBar = ehDataset
    ? { id: modelo.fonte!, label: `Dataset · ${dados.escalar.DatasetNome ?? modelo.fonte}`, params: [] }
    : def
      ? { id: def.id, label: def.label, params: def.params }
      : null;

  return (
    <div className="space-y-4">
      <PreviewBar
        modeloId={modelo.id}
        nome={modelo.nome}
        fonte={fonteBar}
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

      {fonteBloqueada ? (
        <p className="rounded-sm border bg-card p-6 text-center text-sm text-muted-foreground">
          Você não tem permissão para ver a fonte de dados deste modelo.
        </p>
      ) : faltamParams ? (
        <p className="rounded-sm border bg-card p-6 text-center text-sm text-muted-foreground">
          Selecione os parâmetros da fonte de dados acima para visualizar com dados reais.
        </p>
      ) : (
        <div className="doc-print-area overflow-auto">
          <DocRender schema={modelo.schema} escalar={dados.escalar} linhas={dados.linhas} />
        </div>
      )}
      {ehDataset && datasetColunas.length > 0 && (
        <p className="doc-no-print text-xs text-muted-foreground">
          Colunas disponíveis como tokens:{" "}
          {datasetColunas.map((c) => `[${c}]`).join(" · ")}
        </p>
      )}
    </div>
  );
}
