import { CheckCircle2, Circle, CircleDot, FolderOpen } from "lucide-react";
import { cn, formatarData } from "@/lib/utils";
import type { Andamento, FaseAndamento } from "@/modules/portal/andamento";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

const ROTULO = { nao_iniciada: "Não iniciada", em_andamento: "Em andamento", concluida: "Concluída" } as const;

/** Situação da fase com texto + ícone (nunca só cor). Disciplina sem fase: chip sem sigla. */
function ChipFase({ fase }: { fase: FaseAndamento }) {
  const Icone = fase.situacao === "concluida" ? CheckCircle2 : fase.situacao === "em_andamento" ? CircleDot : Circle;
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 font-normal",
        fase.situacao === "concluida" && "text-success-text",
        fase.situacao === "nao_iniciada" && "text-muted-foreground",
      )}
    >
      <Icone className="size-3.5" aria-hidden />
      {fase.sigla && <span className="font-semibold">{fase.sigla}</span>}
      {ROTULO[fase.situacao]}
      {fase.concluidaEm && <span className="font-mono">{formatarData(fase.concluidaEm)}</span>}
    </Badge>
  );
}

/** Card "Andamento": cada disciplina com as fases na situação que o cliente vê (sem datas futuras). */
export function AndamentoCard({ andamento }: { andamento: Andamento }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Andamento ({andamento.percentual}% concluído)</CardTitle>
      </CardHeader>
      <CardContent>
        {andamento.disciplinas.length === 0 ? (
          <EmptyState icon={FolderOpen} title="Nenhuma disciplina cadastrada." />
        ) : (
          <ul className="divide-y text-sm">
            {andamento.disciplinas.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2.5">
                <span className="font-medium">{d.nome}</span>
                <div className="flex flex-wrap gap-1.5">
                  {d.fases.map((f) => (
                    <ChipFase key={f.faseId ?? "disciplina"} fase={f} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
