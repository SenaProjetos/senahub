import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, Diamond, Folder, ListTree } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { modeloParaRevisar } from "@/modules/planejamento/modelos/service";
import { formatarDataHora } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Modelo de EAP" };

/**
 * O modelo por inteiro, só leitura: o que cada nome do arquivo virou e a árvore que ele criaria.
 * Editar um modelo é REIMPORTAR o arquivo — a autoria continua no MS Project.
 */
export default async function ModeloEapPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("planejamento", "ver");
  const { id } = await params;
  const modelo = await modeloParaRevisar(id);
  if (!modelo) notFound();

  const estrutura = modelo.estrutura;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">{modelo.nome}</h1>
          <p className="text-xs text-muted-foreground">
            {modelo.arquivoNome ? `${modelo.arquivoNome} · ` : ""}atualizado em {formatarDataHora(modelo.updatedAt)}
          </p>
          {modelo.descricao && <p className="mt-1 text-sm text-muted-foreground">{modelo.descricao}</p>}
        </div>
        <Button variant="outline" size="sm" render={<Link href="/planejamento/modelos" />}>
          <ArrowLeft className="size-3.5" /> Modelos
        </Button>
      </div>

      {!estrutura ? (
        <p className="rounded-sm border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          Este modelo foi gravado num formato que o sistema não lê mais. Importe o arquivo do MS Project de
          novo para recriá-lo.
        </p>
      ) : (
        <>
          <div className="rounded-sm border bg-muted/30 px-3 py-2 text-xs">
            <strong>{estrutura.linhas.length}</strong> linhas ·{" "}
            <strong>{estrutura.linhas.filter((l) => l.tipoEap === "mrc").length}</strong> marcos ·{" "}
            <strong>{estrutura.linhas.reduce((s, l) => s + l.predecessoras.length, 0)}</strong> dependências ·{" "}
            <strong>{estrutura.linhas.filter((l) => l.deTerceiro).length}</strong> etapas de terceiro · jornada do
            arquivo {estrutura.jornadaMinutos / 60} h
          </div>

          <section className="space-y-1.5">
            <h2 className="text-sm font-medium">O que cada nome do arquivo virou</h2>
            <ul className="divide-y rounded-sm border text-sm">
              {modelo.nomes.map((n) => (
                <li key={n.chave} className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5">
                  <span className="truncate">{n.origem}</span>
                  <Badge variant={n.tipo === "agrupamento" ? "outline" : "secondary"}>
                    {n.tipo === "fase" ? (
                      <Folder className="size-3" />
                    ) : n.tipo === "disciplina" ? (
                      <ListTree className="size-3" />
                    ) : (
                      <Building2 className="size-3" />
                    )}
                    {n.tipo === "agrupamento" ? "agrupamento" : n.virou}
                  </Badge>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-1.5">
            <h2 className="text-sm font-medium">Estrutura</h2>
            <Arvore linhas={estrutura.linhas} />
          </section>
        </>
      )}
    </div>
  );
}

type LinhaArvore = {
  id: string;
  parentId: string | null;
  ordem: number;
  nome: string;
  tipoEap: string;
  duracaoDias: number;
  deTerceiro: boolean;
};

/** Árvore do modelo, indentada. Componente de topo, nunca definido dentro do pai (ADR-0002). */
function Arvore({ linhas }: { linhas: LinhaArvore[] }) {
  const filhos = new Map<string | null, LinhaArvore[]>();
  for (const l of linhas) {
    const lista = filhos.get(l.parentId) ?? [];
    lista.push(l);
    filhos.set(l.parentId, lista);
  }
  const itens: { linha: LinhaArvore; nivel: number }[] = [];
  const descer = (pai: string | null, nivel: number) => {
    if (nivel > 12) return;
    for (const l of (filhos.get(pai) ?? []).sort((a, b) => a.ordem - b.ordem)) {
      itens.push({ linha: l, nivel });
      descer(l.id, nivel + 1);
    }
  };
  descer(null, 0);

  return (
    <ul className="divide-y rounded-sm border text-sm">
      {itens.map(({ linha, nivel }) => (
        <li key={linha.id} className="flex items-center gap-2 px-2.5 py-1">
          <span style={{ paddingLeft: nivel * 16 }} className="flex min-w-0 flex-1 items-center gap-1.5">
            {linha.tipoEap === "mrc" && <Diamond className="size-3 shrink-0 fill-current" />}
            <span className={`truncate ${linha.tipoEap === "fas" || linha.tipoEap === "disc" ? "font-medium" : ""}`}>
              {linha.nome}
            </span>
            {linha.deTerceiro && <span className="shrink-0 text-[10px] text-muted-foreground">terceiro</span>}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {linha.tipoEap === "mrc" ? "marco" : linha.duracaoDias > 0 ? `${linha.duracaoDias} d` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
