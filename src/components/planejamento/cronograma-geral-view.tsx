"use client";

import { useState } from "react";
import Link from "next/link";
import { ZoomIn, ZoomOut, Flag, ListTree } from "lucide-react";
import { Gantt, GANTT_PX_DEFAULT } from "@/components/planejamento/gantt";
import type { EapTarefaDTO } from "@/modules/planejamento/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

type ProjetoCron = { id: string; codigo: string; nome: string; temLinhaBase: boolean; tarefas: EapTarefaDTO[] };

export function CronogramaGeralView({ projetos }: { projetos: ProjetoCron[] }) {
  const [px, setPx] = useState(Math.max(6, GANTT_PX_DEFAULT - 6)); // começa um pouco menor (visão ampla)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Cronograma geral</h2>
          <p className="text-sm text-muted-foreground">
            {projetos.length} projeto(s) ativo(s) com cronograma · barra clara = previsto, faixa inferior = linha de base.
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

      {projetos.length === 0 ? (
        <EmptyState icon={ListTree} title="Nenhum projeto ativo com cronograma" />
      ) : (
        projetos.map((p) => (
          <Card key={p.id}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">
                  <Link href={`/planejamento/${p.id}`} className="hover:underline">
                    <span className="font-mono text-muted-foreground">{formatarCodigo(p.codigo)}</span> {p.nome}
                  </Link>
                </CardTitle>
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
