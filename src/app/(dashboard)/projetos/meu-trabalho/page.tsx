import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { minhasDisciplinas } from "@/modules/projetos/meu-trabalho/queries";
import { STATUS_LABEL, STATUS_CHIP } from "@/modules/projetos/status";
import { formatarData } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Meu trabalho" };

export default async function MeuTrabalhoPage() {
  const user = await requirePermission("projetos", "ver");
  const disciplinas = await minhasDisciplinas(user.id);

  const atrasadas = disciplinas.filter((d) => d.atraso > 0);
  const nosPrazos = disciplinas.filter((d) => d.atraso === 0);

  function DisciplinaRow({ d }: { d: (typeof disciplinas)[number] }) {
    return (
      <Link
        href={`/projetos/${d.projetoId}`}
        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-sm">{d.nome}</p>
          <p className="truncate text-xs text-muted-foreground">
            <span className="font-mono">{d.projetoCodigo}</span> · {d.projetoNome}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {d.prazo && (
            <span className={cn("text-xs", d.atraso > 0 ? "text-destructive font-medium" : "text-muted-foreground")}>
              {d.atraso > 0 ? `Atrasada ${d.atraso}d` : formatarData(d.prazo)}
            </span>
          )}
          <Badge variant="outline" className={cn("text-xs", STATUS_CHIP[d.status])}>
            {STATUS_LABEL[d.status]}
          </Badge>
        </div>
      </Link>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Meu trabalho</h2>
        <p className="text-sm text-muted-foreground">
          Disciplinas nas quais você é responsável em projetos ativos ({disciplinas.length} no total).
        </p>
      </div>

      {disciplinas.length === 0 ? (
        <EmptyState icon={Briefcase} title="Nenhuma disciplina atribuída a você em projetos ativos." />
      ) : (
        <div className="space-y-4">
          {atrasadas.length > 0 && (
            <Card className="border-destructive/40">
              <CardHeader className="pb-1 pt-4">
                <CardTitle className="text-sm text-destructive">
                  Atrasadas ({atrasadas.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {atrasadas.map((d) => <DisciplinaRow key={d.disciplinaId} d={d} />)}
                </div>
              </CardContent>
            </Card>
          )}

          {nosPrazos.length > 0 && (
            <Card>
              <CardHeader className="pb-1 pt-4">
                <CardTitle className="text-sm text-muted-foreground">
                  Em andamento ({nosPrazos.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {nosPrazos.map((d) => <DisciplinaRow key={d.disciplinaId} d={d} />)}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
