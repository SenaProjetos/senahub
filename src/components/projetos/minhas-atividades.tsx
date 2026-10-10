"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, Check } from "lucide-react";
import { moverTarefa } from "@/modules/tarefas/actions";
import type { AtividadesDoProjeto } from "@/modules/projetos/meu-trabalho/queries";
import { formatarData, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";

/**
 * Minhas atividades (reunião de 08/10/2026, item 10): as atividades abertas por projeto, as mesmas
 * que o ponto oferece. "Terminei" move o card para a coluna concluída (a mesma ação do quadro de
 * Tarefas) — NÃO muda o % da EAP: a linha fica verde e o gestor valida os 100%.
 * Quem vê o trabalho de outra pessoa só lê (`podeConcluir` falso).
 */
export function MinhasAtividades({
  projetos,
  statusConcluidoId,
  podeConcluir,
}: {
  projetos: AtividadesDoProjeto[];
  statusConcluidoId: string | null;
  podeConcluir: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [outrasAbertas, setOutrasAbertas] = useState<ReadonlySet<string>>(new Set());
  if (projetos.length === 0) return null;

  // O confirm vem ANTES do start: dentro da transition o setState do diálogo suspende e trava a tela.
  async function terminei(id: string, titulo: string) {
    if (!statusConcluidoId) return;
    const ok = await confirm({
      title: `Marcar "${titulo}" como concluída?`,
      description: "O gestor é quem valida os 100% na EAP — a linha fica sinalizada para ele conferir.",
      confirmLabel: "Terminei",
    });
    if (!ok) return;
    start(async () => {
      const r = await moverTarefa({ id, statusId: statusConcluidoId });
      if (r.ok) {
        toast.success("Atividade marcada como concluída.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <section className="space-y-3" aria-label="Atividades">
      <h3 className="text-sm font-semibold">Atividades</h3>
      {projetos.map((p) => {
        const principais = p.atividades.filter((a) => a.grupo === "periodo");
        const outras = p.atividades.filter((a) => a.grupo === "etapa");
        const abertas = outrasAbertas.has(p.projetoId);
        const linha = (a: AtividadesDoProjeto["atividades"][number]) => (
          <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 text-sm">
            <span className="min-w-0 flex-1 truncate font-medium max-sm:basis-full">{a.titulo}</span>
            <span className={cn("flex items-center gap-1 whitespace-nowrap text-xs", a.atrasada ? "font-medium text-destructive" : "text-muted-foreground")}>
              <CalendarDays className="size-3" aria-hidden />
              {a.janela ? `${formatarData(a.janela.inicio)} → ${formatarData(a.janela.fim)}` : a.prazo ? formatarData(a.prazo) : "sem data"}
            </span>
            {a.atrasada && (
              <Badge variant="outline" className="border-destructive/40 text-[11px] text-destructive">
                atrasada
              </Badge>
            )}
            {podeConcluir && statusConcluidoId && (
              <Button size="xs" variant="outline" disabled={pending} onClick={() => void terminei(a.id, a.titulo)}>
                <Check className="size-3" aria-hidden /> Terminei
              </Button>
            )}
          </li>
        );
        return (
          <Card key={p.projetoId}>
            <CardHeader className="pb-1 pt-4">
              <CardTitle className="text-sm">
                <span className="font-mono text-muted-foreground">{p.projetoCodigo}</span> · {p.projetoNome}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y">{principais.map(linha)}</ul>
              {outras.length > 0 && !abertas && (
                <button
                  type="button"
                  onClick={() => setOutrasAbertas((s) => new Set(s).add(p.projetoId))}
                  className="w-full border-t px-4 py-2 text-left text-xs text-muted-foreground hover:bg-muted/50"
                >
                  Ver outras da etapa ({outras.length})
                </button>
              )}
              {outras.length > 0 && abertas && (
                <>
                  <p className="border-t bg-muted/40 px-4 py-1.5 text-xs font-medium text-muted-foreground">Outras da etapa</p>
                  <ul className="divide-y">{outras.map(linha)}</ul>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}
