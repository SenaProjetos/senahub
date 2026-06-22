import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarDataHora } from "@/lib/utils";
import type { timelineStatusProjeto } from "@/modules/projetos/queries";
import { STATUS_LABEL } from "@/modules/projetos/status";
import { Clock } from "lucide-react";

type Evento = Awaited<ReturnType<typeof timelineStatusProjeto>>[number];

const STATUS_COR: Record<string, string> = {
  aguardando: "bg-muted-foreground/30",
  em_andamento: "bg-warning",
  em_revisao: "bg-primary",
  entregue: "bg-primary",
  aprovado: "bg-success",
};

function eventoLabel(e: Evento) {
  if (e.acao === "validar-entrega") return "Entrega validada";
  const s = e.status as string | null;
  if (s && s in STATUS_LABEL) return STATUS_LABEL[s as keyof typeof STATUS_LABEL];
  return "Atualização de status";
}

/** N-07: linha do tempo de mudanças de status das disciplinas. */
export function StatusTimeline({ eventos }: { eventos: Evento[] }) {
  if (eventos.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="size-4 text-muted-foreground" /> Histórico de status
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="relative space-y-3 border-l border-muted pl-4">
          {eventos.map((e) => {
            const cor = STATUS_COR[e.status ?? ""] ?? "bg-muted-foreground/40";
            return (
              <li key={e.id} className="relative">
                <span
                  className={`absolute -left-[1.175rem] mt-1 size-2.5 rounded-full ring-2 ring-background ${cor}`}
                />
                <p className="text-sm font-medium leading-tight">
                  {e.disciplinaNome}
                  <span className="ml-1.5 font-normal text-muted-foreground">→ {eventoLabel(e)}</span>
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {e.userName} · {formatarDataHora(new Date(e.createdAt))}
                </p>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
