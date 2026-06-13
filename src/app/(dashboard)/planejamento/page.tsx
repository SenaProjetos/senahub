import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { projetosComPlano } from "@/modules/planejamento/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Planejamento" };

const fmt = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

export default async function PlanejamentoPage() {
  const user = await requirePermission("planejamento", "ver");
  const projetos = await projetosComPlano(user);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Planejamento</h2>
        <p className="text-sm text-muted-foreground">
          EAP e cronograma (gantt) por projeto, com linha de base. Selecione um projeto.
        </p>
      </div>

      {projetos.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum projeto disponível.
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
                      <span className="font-mono text-primary">{p.codigo}</span> · {p.nome}
                    </CardTitle>
                    {p.situacao !== "em_andamento" && (
                      <Badge variant="outline" className="capitalize">
                        {p.situacao}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
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
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
