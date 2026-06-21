"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ZoomIn, ZoomOut, Flag, ListTree, Search } from "lucide-react";
import { Gantt, GANTT_PX_DEFAULT } from "@/components/planejamento/gantt";
import type { EapTarefaDTO } from "@/modules/planejamento/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { SITUACAO_PROJETO_LABEL } from "@/modules/projetos/status";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";

type Situacao = "em_andamento" | "concluido" | "arquivado" | "cancelado";
type ProjetoCron = { id: string; codigo: string; nome: string; situacao: Situacao; temLinhaBase: boolean; tarefas: EapTarefaDTO[] };

const SITUACOES: Situacao[] = ["em_andamento", "concluido", "arquivado", "cancelado"];

export function CronogramaGeralView({ projetos }: { projetos: ProjetoCron[] }) {
  const [px, setPx] = useState(Math.max(6, GANTT_PX_DEFAULT - 6));
  const [busca, setBusca] = useState("");
  const [situacoes, setSituacoes] = useState<Set<Situacao>>(new Set(["em_andamento"]));

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return projetos.filter((p) => {
      if (!situacoes.has(p.situacao)) return false;
      if (!q) return true;
      return p.nome.toLowerCase().includes(q) || p.codigo.includes(q.replace(/\D/g, ""));
    });
  }, [projetos, busca, situacoes]);

  function toggleSituacao(s: Situacao) {
    setSituacoes((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Cronograma geral</h2>
          <p className="text-sm text-muted-foreground">
            {visiveis.length} de {projetos.length} projeto(s) · barra clara = previsto, faixa inferior = linha de base.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-1 text-xs text-muted-foreground">Zoom</span>
          <Button size="icon-sm" variant="outline" aria-label="Diminuir zoom" onClick={() => setPx((p) => Math.max(4, p - 3))} disabled={px <= 4}>
            <ZoomOut className="size-3.5" />
          </Button>
          <Button size="icon-sm" variant="outline" aria-label="Aumentar zoom" onClick={() => setPx((p) => Math.min(48, p + 3))} disabled={px >= 48}>
            <ZoomIn className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou código…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-8 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {SITUACOES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleSituacao(s)}
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                situacoes.has(s)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background text-muted-foreground hover:border-primary/50"
              }`}
            >
              {SITUACAO_PROJETO_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {visiveis.length === 0 ? (
        <EmptyState icon={ListTree} title="Nenhum projeto com cronograma para os filtros selecionados" />
      ) : (
        visiveis.map((p) => (
          <Card key={p.id}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">
                  <Link href={`/planejamento/${p.id}`} className="hover:underline">
                    <span className="font-mono text-muted-foreground">{formatarCodigo(p.codigo)}</span> {p.nome}
                  </Link>
                </CardTitle>
                {p.situacao !== "em_andamento" && (
                  <Badge variant="outline">{SITUACAO_PROJETO_LABEL[p.situacao]}</Badge>
                )}
                {p.temLinhaBase ? (
                  <Badge variant="outline" className="text-info border-info/40"><Flag className="mr-1 size-3" /> com linha de base</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">sem linha de base</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Gantt tarefas={p.tarefas} px={px} />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
