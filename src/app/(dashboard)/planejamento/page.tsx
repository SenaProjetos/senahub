import type { Metadata } from "next";
import Link from "next/link";
import { GanttChart, Rocket, ListTree } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { projetosComPlano } from "@/modules/planejamento/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Planejamento" };

const fmt = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

export default async function PlanejamentoPage() {
  const user = await requirePermission("planejamento", "ver");
  const projetos = await projetosComPlano(user);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Planejamento</h2>
          <p className="text-sm text-muted-foreground">
            EAP e cronograma (gantt) por projeto, com linha de base. Selecione um projeto.
          </p>
        </div>
        <Button variant="outline" size="sm" render={<Link href="/planejamento/cronograma" />}>
          <GanttChart className="size-4" /> Cronograma geral
        </Button>
      </div>

      {projetos.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={ListTree}
              title="Nenhum projeto disponível"
              description="Você ainda não participa de projetos com planejamento."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projetos.map((p) => (
            <Link key={p.id} href={`/planejamento/${p.id}`} className="group">
              <Card className="h-full transition-colors group-hover:border-primary">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">
                      <span className="font-mono text-primary">{formatarCodigo(p.codigo)}</span> · {p.nome}
                    </CardTitle>
                    {p.situacao !== "em_andamento" && (
                      <Badge variant="outline" className="capitalize">
                        {p.situacao}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {p.totalTarefas === 0 ? (
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>Sem tarefas de EAP.</span>
                      <span className="inline-flex items-center gap-1 font-medium text-primary group-hover:underline">
                        <Rocket className="size-3.5" /> Iniciar planejamento
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{p.totalTarefas} tarefa(s)</span>
                        <span className="font-mono">
                          {fmt(p.inicio)} – {fmt(p.fim)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-sm bg-muted">
                          <div className="h-full bg-primary" style={{ width: `${p.progresso}%` }} />
                        </div>
                        <span className="w-9 text-right font-mono text-xs">{p.progresso}%</span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
