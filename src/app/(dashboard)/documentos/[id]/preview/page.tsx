import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { obterModelo, opcoesParametros } from "@/modules/documentos/queries";
import {
  resolverModelo,
  isFonteDataset,
  DATASET_PREFIX,
  fontesUsadasNoSchema,
} from "@/modules/documentos/fontes";
import { chaveParamFonte, fonteDef } from "@/modules/documentos/fontes-meta";
import { podeVerFonte } from "@/modules/documentos/fontes-perm";
import { colunasDoDataset } from "@/modules/documentos/dataset-queries";
import { DocRender } from "@/components/documentos/doc-render";
import { PreviewBar, type FonteBar } from "@/components/documentos/preview-bar";

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

  // MULTI-COLEÇÃO: conjunto de fontes usadas = primária + fonteId das bandas.
  const usadas = fontesUsadasNoSchema(modelo.fonte, modelo.schema);
  const primaria = (modelo.fonte ?? "").trim();

  // Constrói paramsPorFonte a partir da URL: a primária usa chaves sem prefixo
  // (retrocompat); as demais usam `f_<fonteId>_<paramId>`.
  const paramsPorFonte: Record<string, Record<string, string>> = {};
  for (const fid of usadas) {
    const def = fonteDef(fid);
    if (!def) continue; // dataset (sem params) ou desconhecida
    const ehPrim = fid === primaria;
    const obj: Record<string, string> = {};
    for (const p of def.params) {
      const chave = chaveParamFonte(fid, p.id, ehPrim);
      if (sp[chave]) obj[p.id] = sp[chave];
    }
    paramsPorFonte[fid] = obj;
  }

  // CRÍTICO (segurança): alguma fonte de SISTEMA usada que o viewer não pode ver?
  // O resolverModelo já blinda os dados (resolve vazio), mas mostramos o aviso
  // em vez de um documento "furado". Datasets de CSV não passam por esse gate.
  const fontesBloqueadas = (
    await Promise.all(
      usadas.map(async (fid) =>
        !isFonteDataset(fid) && !(await podeVerFonte(user.role, fid)) ? fid : null,
      ),
    )
  ).filter((f): f is string => f !== null);
  const fonteBloqueada = fontesBloqueadas.length > 0;

  // Resolve todas as fontes (com gate de permissão por fonte no server).
  const resolvido = await resolverModelo(modelo.fonte, modelo.schema, paramsPorFonte, user.role);

  // Faltam parâmetros se ALGUMA fonte de sistema usada tem param não preenchido.
  const faltamParams = usadas.some((fid) => {
    const def = fonteDef(fid);
    if (!def) return false; // datasets não têm params
    return def.params.some((p) => !(paramsPorFonte[fid] ?? {})[p.id]);
  });

  const opcoes = await opcoesParametros();

  // Barra de params: uma seção por fonte usada que tenha params (sys) ou seja
  // dataset (rótulo informativo). A primária mantém chaves sem prefixo.
  const fontesBar: FonteBar[] = [];
  for (const fid of usadas) {
    const ehPrim = fid === primaria;
    if (isFonteDataset(fid)) {
      const dataset = resolvido.porFonte[fid];
      fontesBar.push({
        id: fid,
        label: `Dataset · ${dataset?.escalar?.DatasetNome ?? fid}`,
        primaria: ehPrim,
        params: [],
      });
      continue;
    }
    const def = fonteDef(fid);
    if (!def) continue; // fonte desconhecida → ignora
    // Inclui mesmo sem params (rótulo no título); a barra só renderiza selects
    // para fontes com params (params: [] → sem caixa de seleção).
    fontesBar.push({ id: def.id, label: def.label, primaria: ehPrim, params: def.params });
  }

  // Colunas de datasets usados (documentação dos tokens) — primária e sub-fontes.
  const datasetsUsados = usadas.filter(isFonteDataset);
  const datasetColunas = (
    await Promise.all(datasetsUsados.map((fid) => colunasDoDataset(fid.slice(DATASET_PREFIX.length))))
  ).flat();
  const colunasUnicas = [...new Set(datasetColunas)];

  return (
    <div className="space-y-4">
      <PreviewBar
        modeloId={modelo.id}
        nome={modelo.nome}
        fontes={fontesBar}
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
          Você não tem permissão para ver uma das fontes de dados deste modelo.
        </p>
      ) : faltamParams ? (
        <p className="rounded-sm border bg-card p-6 text-center text-sm text-muted-foreground">
          Selecione os parâmetros das fontes de dados acima para visualizar com dados reais.
        </p>
      ) : (
        <div className="doc-print-area overflow-auto">
          <DocRender
            schema={modelo.schema}
            escalar={resolvido.escalarPrimaria}
            linhas={resolvido.linhasPrimaria}
            porFonte={resolvido.porFonte}
          />
        </div>
      )}
      {colunasUnicas.length > 0 && (
        <p className="doc-no-print text-xs text-muted-foreground">
          Colunas de dataset disponíveis como tokens:{" "}
          {colunasUnicas.map((c) => `[${c}]`).join(" · ")}
        </p>
      )}
    </div>
  );
}
