"use client";

/**
 * Shell de "guia de entrada" reutilizável por todas as ferramentas.
 * Renderiza, a partir do registry + guia-meta (dados): cabeçalho, desenho
 * esquemático, grupos de campos numerados, legenda lateral, caixa de unidades
 * e dica. O formulário fornece o desenho (SVG) e os campos dentro de <GuiaGrupo>.
 */

import { createContext, useContext, type ReactNode } from "react";
import { Lightbulb, Ruler } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getFerramenta } from "@/modules/ferramentas/registry";
import { getGuia, type GuiaGrupoMeta } from "@/modules/ferramentas/guia-meta";

const GruposCtx = createContext<GuiaGrupoMeta[]>([]);

function NumBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
      {n}
    </span>
  );
}

type Props = {
  /** Slug da ferramenta — resolve registry (ícone/nome/badges) e guia-meta. */
  slug: string;
  /** Desenho esquemático (SVG) da peça. */
  desenho?: ReactNode;
  /** Grupos de campos (<GuiaGrupo>). */
  children: ReactNode;
};

export function GuiaFerramenta({ slug, desenho, children }: Props) {
  const meta = getFerramenta(slug);
  const guia = getGuia(slug);

  // Sem guia cadastrado: degrada para os campos puros (não deveria ocorrer em uso).
  if (!meta || !guia) return <div className="space-y-6">{children}</div>;

  const Icon = meta.icon;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-md bg-primary/10 p-2">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold leading-tight">{meta.nome}</h1>
            <Badge variant="outline" className="text-xs">
              {meta.disciplina}
            </Badge>
            {meta.norma && (
              <Badge variant="secondary" className="text-xs">
                {meta.norma}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{guia.subtitulo}</p>
        </div>
      </div>

      <GruposCtx.Provider value={guia.grupos}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* Esquerda: desenho + grupos numerados */}
          <div className="min-w-0 space-y-6">
            {desenho}
            <div className="space-y-5">{children}</div>
          </div>

          {/* Direita: legenda + unidades + dica */}
          <aside className="space-y-4">
            <Legenda grupos={guia.grupos} />
            <Unidades unidades={guia.unidades} />
            <Dica texto={guia.dica} />
          </aside>
        </div>
      </GruposCtx.Provider>
    </div>
  );
}

/** Grupo de campos numerado. O título vem do guia-meta (pelo n). */
export function GuiaGrupo({ n, children }: { n: number; children: ReactNode }) {
  const grupos = useContext(GruposCtx);
  const g = grupos.find((x) => x.n === n);
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <NumBadge n={n} />
        <h2 className="text-sm font-semibold">{g?.titulo}</h2>
      </div>
      <div className="sm:pl-8">{children}</div>
    </section>
  );
}

function Legenda({ grupos }: { grupos: GuiaGrupoMeta[] }) {
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Guia dos campos
      </h3>
      <ul className="space-y-3">
        {grupos.map((g) => (
          <li key={g.n} className="flex gap-2.5">
            <NumBadge n={g.n} />
            <div className="min-w-0">
              <p className="text-sm font-medium leading-tight">{g.titulo}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{g.descricao}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Unidades({ unidades }: { unidades: string[] }) {
  return (
    <div className="space-y-2 rounded-lg border bg-muted/40 p-4">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Ruler className="h-3.5 w-3.5" />
        Unidades
      </div>
      <ul className="space-y-1 text-xs text-muted-foreground">
        {unidades.map((u, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="text-primary">•</span>
            <span>{u}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Dica({ texto }: { texto: string }) {
  return (
    <div className="flex gap-2.5 rounded-lg border border-primary/20 bg-primary/5 p-4">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <p className="text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Dica: </span>
        {texto}
      </p>
    </div>
  );
}
