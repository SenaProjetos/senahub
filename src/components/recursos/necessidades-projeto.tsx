"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Target, Trash2 } from "lucide-react";
import { removerNecessidade, salvarNecessidade } from "@/modules/rh/habilidades/actions";
import { APTIDAO_LABEL, candidatosParaNecessidade, NIVEIS } from "@/modules/rh/habilidades/regras";
import type { NecessidadesHabilidade } from "@/modules/rh/habilidades/queries";
import type { FolgaNaJanela } from "@/modules/planejamento/heatmap-recursos";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dataCurta } from "@/lib/dias-iso";

/**
 * "Cobrir necessidade" (F2): o que o projeto filtrado precisa (competência + nível mínimo) e quem
 * cobre NA JANELA de análise — nível suficiente e folga no período. Declarado sem validação
 * aparece marcado; sem nível nunca aparece.
 */
export function NecessidadesProjeto({
  projetoId,
  dados,
  pessoas,
  catalogo,
  podeGerir,
  janela,
}: {
  projetoId: string;
  dados: NecessidadesHabilidade;
  pessoas: { userId: string; nome: string; folga: FolgaNaJanela | undefined }[];
  catalogo: { id: string; nome: string }[];
  podeGerir: boolean;
  janela: { inicio: string; fim: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [nova, setNova] = useState({ habilidadeId: "", nivelMinimo: "3" });
  const doProjeto = dados.necessidades.filter((n) => n.projetoId === projetoId);
  const disponiveis = catalogo.filter((h) => !doProjeto.some((n) => n.habilidadeId === h.id));

  function rodar(fn: () => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      const r = await fn();
      if (r.ok) router.refresh();
      else toast.error(r.error ?? "Não foi possível salvar.");
    });
  }

  return (
    <section className="space-y-2 rounded-sm border p-3">
      <header className="flex flex-wrap items-center gap-2">
        <Target className="size-4 text-muted-foreground" aria-hidden />
        <h3 className="text-sm font-semibold">Competências que o projeto precisa</h3>
        <span className="text-xs text-muted-foreground">
          Quem cobre de {dataCurta(janela.inicio)} a {dataCurta(janela.fim)}
        </span>
      </header>
      {doProjeto.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma necessidade cadastrada para este projeto.</p>}
      <ul className="space-y-2">
        {doProjeto.map((n) => {
          const niveis = dados.niveisPorHabilidade[n.habilidadeId] ?? {};
          const candidatos = candidatosParaNecessidade(
            pessoas.map((p) => ({
              userId: p.userId,
              nome: p.nome,
              nivel: niveis[p.userId]?.nivel ?? null,
              validadoEm: niveis[p.userId]?.validadoEm ?? null,
              folga: p.folga?.folga ?? 0,
              diasAusente: p.folga?.diasAusente ?? 0,
            })),
            n.nivelMinimo,
          ).slice(0, 5);
          return (
            <li key={n.id} className="rounded-sm border px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {n.habilidade} <span className="font-normal text-muted-foreground">· mínimo {NIVEIS[n.nivelMinimo].rotulo}</span>
                </p>
                {podeGerir && (
                  <Button size="icon" variant="ghost" className="size-7" aria-label={`Remover necessidade ${n.habilidade}`} disabled={pending}
                    onClick={() => rodar(() => removerNecessidade({ id: n.id }))}>
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
              {candidatos.length === 0 ? (
                <p className="text-xs text-destructive">Ninguém com o nível e com folga na janela — lacuna de cobertura.</p>
              ) : (
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {candidatos.map((c) => (
                    <li key={c.userId} className="rounded-sm bg-muted px-2 py-0.5 text-xs" title={APTIDAO_LABEL[c.aptidao]}>
                      {c.nome} · nível {c.nivel} · folga {c.folga}%{c.aptidao === "apto_declarado" ? " · não validado" : ""}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {podeGerir && disponiveis.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={nova.habilidadeId} onValueChange={(v) => setNova({ ...nova, habilidadeId: v ?? "" })}>
            <SelectTrigger className="h-8 w-56" aria-label="Competência necessária">
              <SelectValue placeholder="Competência…" />
            </SelectTrigger>
            <SelectContent>
              {disponiveis.map((h) => (
                <SelectItem key={h.id} value={h.id}>{h.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={nova.nivelMinimo} onValueChange={(v) => setNova({ ...nova, nivelMinimo: v ?? "3" })}>
            <SelectTrigger className="h-8 w-44" aria-label="Nível mínimo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(NIVEIS).map(([k, d]) => (
                <SelectItem key={k} value={k}>mínimo {d.rotulo}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" disabled={pending || !nova.habilidadeId}
            onClick={() => {
              rodar(() => salvarNecessidade({ projetoId, habilidadeId: nova.habilidadeId, nivelMinimo: Number(nova.nivelMinimo) }));
              setNova({ habilidadeId: "", nivelMinimo: "3" });
            }}>
            <Plus className="size-3.5" /> Adicionar necessidade
          </Button>
        </div>
      )}
    </section>
  );
}
