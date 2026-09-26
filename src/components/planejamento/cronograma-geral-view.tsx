"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Flag, ListTree, Search } from "lucide-react";
import { GanttMini } from "@/components/planejamento/gantt-mini";
import type { ModoGantt } from "@/components/planejamento/gantt-barra";
import { ZOOMS_GANTT, type CalendarioGantt, type ZoomGantt } from "@/modules/planejamento/gantt-escala";
import type { EapTarefaDTO } from "@/modules/planejamento/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { SITUACAO_PROJETO_LABEL } from "@/modules/projetos/status";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";

type Situacao = "em_andamento" | "concluido" | "arquivado" | "cancelado";
type ProjetoCron = { id: string; codigo: string; nome: string; situacao: Situacao; temLinhaBase: boolean; tarefas: EapTarefaDTO[] };

const SITUACOES: Situacao[] = ["em_andamento", "concluido", "arquivado", "cancelado"];

const ENCERRADOS = new Set(["con", "can", "arq"]);

/** Mesma regra de "atrasada" que `qualidade.ts` usa (Doc 03 §26) — status encerrado sai da
 * conta, senão uma tarefa cancelada no ano passado marcaria o projeto como atrasado para
 * sempre. Ler `critica` do DTO em vez de recalcular, que é o que faz este painel só
 * mostrar (D7) — o cálculo mora no motor, não na tela. */
function temAtraso(p: ProjetoCron, hoje: string) {
  return p.tarefas.some(
    (t) => (t.fimBaseline ?? t.fimPrevisto) < hoje && (t.progresso ?? 0) < 100 && !ENCERRADOS.has(t.status),
  );
}

export function CronogramaGeralView({
  projetos,
  calendario,
  hoje,
}: {
  projetos: ProjetoCron[];
  /** O calendário do motor, um só para a carteira (D8) — sombreia o dia não útil. */
  calendario: CalendarioGantt;
  /** `YYYY-MM-DD` do servidor. */
  hoje: string;
}) {
  // Semanas: o panorama da carteira raramente cabe em dias, e em meses a barra de uma tarefa de 3 dias
  // vira um risco. O seletor é o mesmo do cronograma do projeto.
  const [zoom, setZoom] = useState<ZoomGantt>("semanas");
  const [modo, setModo] = useState<ModoGantt>("planejamento");
  const [busca, setBusca] = useState("");
  const [situacoes, setSituacoes] = useState<Set<Situacao>>(new Set(["em_andamento"]));
  const [soAtrasados, setSoAtrasados] = useState(false);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return projetos.filter((p) => {
      if (!situacoes.has(p.situacao)) return false;
      if (soAtrasados && !temAtraso(p, hoje)) return false;
      if (!q) return true;
      return p.nome.toLowerCase().includes(q) || p.codigo.includes(q.replace(/\D/g, ""));
    });
  }, [projetos, busca, situacoes, soAtrasados, hoje]);

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
            {visiveis.length} de {projetos.length} projeto(s) · leitura e sequenciamento entre projetos —
            o prazo interno de cada um só se edita dentro dele.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-sm border" role="group" aria-label="Visão do cronograma">
            {(
              [
                ["planejamento", "Gráfico de Gantt"],
                ["controle", "Gantt de Controle"],
              ] as [ModoGantt, string][]
            ).map(([v, rotulo]) => (
              <button
                key={v}
                type="button"
                aria-pressed={modo === v}
                onClick={() => setModo(v)}
                className={`px-3 py-1 text-xs font-medium ${
                  modo === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-sm border" role="group" aria-label="Escala de tempo">
            {ZOOMS_GANTT.map((z) => (
              <button
                key={z.id}
                type="button"
                aria-pressed={zoom === z.id}
                onClick={() => setZoom(z.id)}
                className={`px-3 py-1 text-xs font-medium ${
                  zoom === z.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {z.rotulo}
              </button>
            ))}
          </div>
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
          <button
            type="button"
            onClick={() => setSoAtrasados((v) => !v)}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
              soAtrasados
                ? "border-destructive bg-destructive text-destructive-foreground"
                : "border-input bg-background text-muted-foreground hover:border-destructive/50"
            }`}
          >
            Com atraso
          </button>
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
              <GanttMini tarefas={p.tarefas} calendario={calendario} hoje={hoje} zoom={zoom} modo={modo} />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
