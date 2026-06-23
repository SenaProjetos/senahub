"use client";

import Link from "next/link";
import { Clock, PackageCheck, ListChecks, TriangleAlert, TrendingDown, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import type { Granularidade, ProjetistaProdutividade } from "@/modules/rh/produtividade/queries";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function rotulo(periodo: string, g: Granularidade): string {
  if (g === "mes") {
    const [ano, mes] = periodo.split("-");
    return `${MESES[Number(mes) - 1]}/${ano.slice(2)}`;
  }
  return periodo.split("-W")[1] ? `S${periodo.split("-W")[1]}` : periodo;
}

export function ProdutividadeView({
  periodos,
  granularidade,
  projetistas,
}: {
  periodos: string[];
  granularidade: Granularidade;
  projetistas: ProjetistaProdutividade[];
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Produtividade por projetista</h2>
          <p className="text-sm text-muted-foreground">
            Comparação de cada projetista com a <strong>própria média</strong> do período — destaca quedas de produção.
          </p>
        </div>
        <div className="flex rounded-sm border p-0.5 text-sm">
          {(["semana", "mes"] as const).map((g) => (
            <Link
              key={g}
              href={`/rh/produtividade?g=${g}`}
              className={`rounded-sm px-3 py-1 ${granularidade === g ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {g === "semana" ? "Semanal" : "Mensal"}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><PackageCheck className="size-3.5" /> entregas validadas</span>
        <span className="inline-flex items-center gap-1"><ListChecks className="size-3.5" /> tarefas concluídas</span>
        <span className="inline-flex items-center gap-1"><Clock className="size-3.5" /> horas de ponto</span>
        <span className="inline-flex items-center gap-1"><TriangleAlert className="size-3.5" /> entregas atrasadas</span>
        <span className="inline-flex items-center gap-1"><TrendingDown className="size-3.5 text-destructive" /> produção &lt; 70% da média do projetista</span>
      </div>

      {projetistas.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon={Users} title="Sem atividade de projetistas no período." />
          </CardContent>
        </Card>
      ) : (
        projetistas.map((p) => (
          <Card key={p.userId}>
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-base">
                {p.nome}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {ROLE_LABELS[p.role as Role] ?? p.role}
                </span>
              </CardTitle>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span title="Entregas no período"><PackageCheck className="mr-1 inline size-3.5" />{p.totalEntregas}</span>
                <span title="Tarefas concluídas"><ListChecks className="mr-1 inline size-3.5" />{p.totalTarefas}</span>
                <span title="Horas de ponto"><Clock className="mr-1 inline size-3.5" />{p.totalHoras}h</span>
                <span title="Entregas atrasadas" className={p.totalAtrasos > 0 ? "text-warning" : ""}>
                  <TriangleAlert className="mr-1 inline size-3.5" />{p.totalAtrasos}
                </span>
                <span title="Produção média por período">média {p.mediaOutput}</span>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-separate border-spacing-0 text-center text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="sticky left-0 bg-card px-2 py-1 text-left font-mono text-[10px] uppercase tracking-wider">Período</th>
                    {periodos.map((per) => (
                      <th key={per} className="px-1.5 py-1 font-mono text-[10px]">{rotulo(per, granularidade)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <LinhaOutput projetista={p} />
                  <Linha label="Entregas" valores={p.periodos.map((w) => w.entregas)} />
                  <Linha label="Tarefas" valores={p.periodos.map((w) => w.tarefas)} />
                  <Linha label="Horas" valores={p.periodos.map((w) => w.horas)} sufixo="h" />
                  <Linha label="Atrasos" valores={p.periodos.map((w) => w.atrasos)} alerta />
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function LinhaOutput({ projetista }: { projetista: ProjetistaProdutividade }) {
  return (
    <tr>
      <td className="sticky left-0 bg-card px-2 py-1 text-left font-semibold">Produção</td>
      {projetista.periodos.map((w) => (
        <td key={w.periodo} className="px-1 py-1">
          <span
            className={`inline-flex min-w-7 items-center justify-center gap-0.5 rounded-sm px-1.5 py-0.5 font-semibold tabular-nums ${
              w.queda ? "bg-destructive/15 text-destructive" : w.output > 0 ? "bg-success/15 text-success" : "text-muted-foreground"
            }`}
            title={`${w.entregas} entregas · ${w.tarefas} tarefas · ${w.horas}h · ${w.atrasos} atrasos`}
          >
            {w.queda && <TrendingDown className="size-3" />}
            {w.output}
          </span>
        </td>
      ))}
    </tr>
  );
}

function Linha({
  label,
  valores,
  sufixo = "",
  alerta = false,
}: {
  label: string;
  valores: number[];
  sufixo?: string;
  alerta?: boolean;
}) {
  return (
    <tr className="text-muted-foreground">
      <td className="sticky left-0 bg-card px-2 py-1 text-left">{label}</td>
      {valores.map((v, i) => (
        <td key={i} className={`px-1.5 py-1 tabular-nums ${alerta && v > 0 ? "font-semibold text-warning" : ""}`}>
          {v > 0 ? `${v}${sufixo}` : <span className="text-muted-foreground/30">·</span>}
        </td>
      ))}
    </tr>
  );
}
