import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * F3.10 — número + rótulo, o card de indicador mais repetido do sistema. `grep` achou a mesma
 * forma (`CardDescription` mono/uppercase + `CardTitle` grande) reimplementada em ~12 arquivos,
 * fora do Comercial; a "7 duplicatas" do backlog é uma subestimativa medida antes de o `grep`
 * rodar de verdade. Consolida aqui só o que o Comercial usa hoje — as demais telas ficam listadas
 * como follow-up em `06-progresso.md`, não migradas nesta tarefa.
 *
 * Duas variantes, porque as duas já existiam com visual DIFERENTE e o aceite pede visual
 * inalterado — não é escolha nova, é nomear o que já tinha:
 *   - `"padrao"` — o `<Card>` cheio (dashboard `/comercial`: "Aceitas no mês", "Leads ativos").
 *   - `"compacta"` — o tile denso da Empresa 360 (F3.7), 6 por linha, com ícone opcional.
 */
export function KpiCard({
  label,
  valor,
  detalhe,
  icone: Icone,
  variante = "padrao",
  className,
}: {
  label: string;
  valor: React.ReactNode;
  detalhe?: string;
  icone?: LucideIcon;
  variante?: "padrao" | "compacta";
  className?: string;
}) {
  if (variante === "compacta") {
    return (
      <div className={cn("rounded-sm border bg-card p-2", className)}>
        <p className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {Icone && <Icone className="size-3" />} {label}
        </p>
        <p className="mt-0.5 text-lg font-bold tabular-nums">{valor}</p>
        {detalhe && <p className="text-[10px] text-muted-foreground">{detalhe}</p>}
      </div>
    );
  }
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em]">
          {Icone && <Icone className="size-3" />} {label}
        </CardDescription>
        <CardTitle className="text-2xl">{valor}</CardTitle>
        {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
      </CardHeader>
    </Card>
  );
}
