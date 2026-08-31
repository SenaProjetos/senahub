import { CheckCircle2, Clock, AlertCircle, TrendingUp, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { cn } from "@/lib/utils";
import { inicioDoDia, inicioDoDiaLocal } from "@/lib/data";
import type { StatusDisciplina } from "@/generated/prisma/client";
import { PESO_STATUS } from "@/modules/projetos/status";
import { saudeProjeto } from "@/modules/projetos/health";

interface ProjetoKpisProps {
  disciplinas: { status: StatusDisciplina; prazo: string | null }[];
  prazoFinal: Date | null;
  situacao: string;
  /** Opcional: margem % para exibir o KPI financeiro. */
  margemPct?: number | null;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  tone?: "success" | "warning" | "danger" | "neutral";
}) {
  const toneClass = {
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
    neutral: "text-foreground",
  }[tone ?? "neutral"];

  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-4">
      <div className="mt-0.5 rounded-md bg-muted p-2">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className={cn("mt-0.5 font-mono text-xl font-bold tabular-nums", toneClass)}>{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

export function ProjetoKpis({ disciplinas, prazoFinal, situacao, margemPct }: ProjetoKpisProps) {
  const total = disciplinas.length;
  const aprovadas = disciplinas.filter((d) => d.status === "aprovado").length;
  const entregues = disciplinas.filter(
    (d) => d.status === "entregue" || d.status === "aprovado",
  ).length;

  const progresso =
    total === 0
      ? 0
      : Math.round(
          (disciplinas.reduce((s, d) => s + PESO_STATUS[d.status], 0) / total) * 100,
        );

  // Prazo — `inicioDoDia` normaliza a meia-noite UTC do banco (ver `lib/data.ts`);
  // `setHours(0,…)` direto recuava o vencimento um dia em America/Sao_Paulo.
  const hoje = inicioDoDiaLocal();
  const venc = situacao === "em_andamento" ? inicioDoDia(prazoFinal) : null;
  const diasAtraso = venc ? Math.max(0, Math.floor((hoje.getTime() - venc.getTime()) / 86_400_000)) : 0;
  const diasRestantes = (() => {
    if (!venc) return null;
    const diff = Math.floor((venc.getTime() - hoje.getTime()) / 86_400_000);
    return diff >= 0 ? diff : null;
  })();

  // Disciplinas com prazo vencido (não aprovadas).
  const atrasadas = disciplinas.filter((d) => {
    if (d.status === "aprovado") return false;
    const p = inicioDoDia(d.prazo);
    return p != null && p < hoje;
  }).length;

  const saude = saudeProjeto(disciplinas, prazoFinal, situacao);
  const saudeConfig = {
    ok: { Icon: ShieldCheck, label: "Saudável", cls: "text-success" },
    atencao: { Icon: ShieldAlert, label: "Atenção", cls: "text-warning" },
    critico: { Icon: ShieldX, label: "Crítico", cls: "text-destructive" },
  } as const;

  return (
    <div className="space-y-2">
    {saude && (() => {
      const { Icon, label, cls } = saudeConfig[saude];
      return (
        <div className={cn("flex items-center gap-1.5 text-sm font-medium", cls)}>
          <Icon className="size-4" aria-hidden />
          Saúde do projeto: {label}
        </div>
      );
    })()}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        icon={CheckCircle2}
        label="Conclusão"
        value={`${progresso}%`}
        sub={`${aprovadas} / ${total} aprovadas`}
        tone={progresso >= 100 ? "success" : progresso >= 50 ? "neutral" : "neutral"}
      />

      <KpiCard
        icon={Clock}
        label={diasAtraso > 0 ? "Atraso no prazo" : "Dias restantes"}
        value={
          diasAtraso > 0
            ? `${diasAtraso}d`
            : diasRestantes != null
              ? `${diasRestantes}d`
              : "—"
        }
        sub={
          diasAtraso > 0
            ? "prazo vencido"
            : diasRestantes != null
              ? "até o prazo final"
              : prazoFinal
                ? "prazo sem restrição"
                : "sem prazo definido"
        }
        tone={diasAtraso > 0 ? "danger" : diasRestantes != null && diasRestantes <= 14 ? "warning" : "neutral"}
      />

      <KpiCard
        icon={AlertCircle}
        label="Disciplinas entregues"
        value={`${entregues} / ${total}`}
        sub={atrasadas > 0 ? `${atrasadas} com prazo vencido` : "nos prazos"}
        tone={atrasadas > 0 ? "danger" : entregues === total && total > 0 ? "success" : "neutral"}
      />

      <KpiCard
        icon={TrendingUp}
        label="Margem"
        value={margemPct != null ? `${margemPct.toFixed(1)}%` : "—"}
        sub={margemPct != null ? (margemPct >= 0 ? "positiva" : "negativa") : "financeiro restrito"}
        tone={
          margemPct == null
            ? "neutral"
            : margemPct >= 20
              ? "success"
              : margemPct >= 0
                ? "warning"
                : "danger"
        }
      />
    </div>
    </div>
  );
}
